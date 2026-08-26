const ModTemplate = require('./../../lib/templates/modtemplate');
const MigrationMain = require('./lib/main');
const ApeBondMain = require('./lib/apebond/main');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Transaction = require('../../lib/saito/transaction').default;

const PeerService = require('saito-js/lib/peer_service').default;

const MIGRATION_TEST_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  'ksaito.saito.io',
  'ksaito.hda0.net'
]);

const AUTO_MIGRATION_OPTIONAL_COLUMNS = {
  announcement_hash: `TEXT DEFAULT ''`,
  migration_type: `TEXT DEFAULT 'standard'`,
  email: `TEXT DEFAULT ''`,
  issuance_tx: `TEXT DEFAULT ''`,
  issuance_at: `INTEGER DEFAULT 0`
};

function autoMigrationTableSql(table_name = 'auto_migration') {
  return `CREATE TABLE IF NOT EXISTS "${table_name}" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT DEFAULT '',
    ticker TEXT DEFAULT '',
    mixin TEXT DEFAULT '',
    nolan_received INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending'
      CHECK (status IN ('awaiting_mixin','pending','issuing','succeeded','failed')),
    tx_sig TEXT DEFAULT '',
    issuance_tx TEXT DEFAULT '',
    issuance_at INTEGER DEFAULT 0,
    blk_id INTEGER DEFAULT 0,
    issued_at INTEGER DEFAULT 0,
    announcement_hash TEXT DEFAULT '',
    migration_type TEXT DEFAULT 'standard',
    email TEXT DEFAULT ''
  )`;
}

class Migration extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Migration';
    this.slug = 'migration';
    this.description = 'Migrate ERC20 or BEP20 tokens to Saito Native Tokens';
    this.categories = 'Core Utilities Messaging';
    this.styles = ['/migration/style.css'];

    this.dependencies = ['Relay', 'Mixin', 'ERC', 'MailRelay'];

    this.main = null;
    this.header = null;

    this.key_cache = {}; // Mapping from Mixin Address --> Saito publicKey
    this.pending_payments = [];
    this.payment_cache = {};
    this.processing_payments = false;

    // A crypto-payment announcement can reach us just before Mixin exposes the
    // corresponding Safe snapshot. It can also be restored during startup
    // before Mixin has installed its dynamic ERC-SAITO module. Retry the exact
    // transaction-hash lookup in both cases instead of relying solely on the
    // module's incremental history cursor.
    this.mixin_reconciliation_timers = {};
    this.mixin_reconciliation_attempts = {};
    this.mixin_reconciliation_delays = [2000, 5000, 15000, 45000, 90000, 120000, 180000];

    this.wrapped_saito_ticker = 'ERC-SAITO';
    this.MAX_DEPOSIT = 1000000; // Max of 1 million at a time

    this.relay_available = false;
    this.can_auto = false;
    this.auto_migration_error = '';
    this.ercMod = null;

    //this.migration_publickey = 'zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK';
    this.migration_publickey = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';
    this.migration_mixin_address = '';

    this.apebond = new ApeBondMain(this.app, this);

    return this;
  }

  isMigrationTestDomain(host = '') {
    const normalized_host = String(host).toLowerCase().replace(/\.$/, '');
    return MIGRATION_TEST_DOMAINS.has(normalized_host);
  }

  returnMigrationHost() {
    if (this.app.BROWSER && typeof window !== 'undefined') {
      return window.location.hostname;
    }

    return this.app.options?.server?.endpoint?.host || '';
  }

  async initialize(app) {
    await super.initialize(app);

    const migration_host = this.returnMigrationHost();

    if (!this.app.BROWSER) {
      if (this.isMigrationTestDomain(migration_host)) {
        this.migration_publickey = this.publicKey;
        console.warn('---> using this node as the migration bot for testing');
      }

      if (this.publicKey === this.migration_publickey) {
        await this.load();

        // ERC-SAITO inbound confirmed via CryptoModule receivePayment polling
        this.app.connection.on('on-receive-expected-payment', (hash, details) => {
          // Secondary stricter checks
          if (details.ticker !== this.wrapped_saito_ticker) {
            return;
          }
          if (details.transaction_signature !== hash) {
            console.warn('not our expected payment');
            return;
          }

          this.confirmMixinInbound(hash);
        });
      }

      return;
    }
  }

  async findAutoMigrationByAnnouncementHash(announcement_hash) {
    if (!announcement_hash) {
      return null;
    }
    let sql = `SELECT * FROM auto_migration WHERE announcement_hash = $announcement_hash LIMIT 1`;
    let rows = await this.app.storage.queryDatabase(
      sql,
      { $announcement_hash: announcement_hash },
      'migration'
    );
    return rows?.length ? rows[0] : null;
  }

  async confirmMixinInbound(hash) {
    const payment = this.payment_cache[hash];
    if (!payment || payment.status !== 'awaiting_mixin') {
      console.warn(`Inbound Mixin doesn't match expected payment...`);
      console.log(this.payment_cache);
      return;
    }

    this.clearMixinReconciliation(hash);
    payment.status = 'pending';
    try {
      await this.updatePayment(payment);
    } catch (err) {
      payment.status = 'awaiting_mixin';
      this.scheduleMixinReconciliation(hash);
      throw err;
    }

    if (!this.pending_payments.some((p) => p.id === payment.id)) {
      this.pending_payments.push(payment);
    }

    if (this.ercMod?.transfers_inbound) {
      delete this.ercMod.transfers_inbound[hash];
      if (Object.keys(this.ercMod.transfers_inbound).length === 0) {
        this.ercMod.stopPolling?.();
      }
    }

    delete this.payment_cache[hash];
  }

  clearMixinReconciliation(hash) {
    const timer = this.mixin_reconciliation_timers?.[hash];
    if (timer) {
      clearTimeout(timer);
    }

    if (this.mixin_reconciliation_timers) {
      delete this.mixin_reconciliation_timers[hash];
    }
    if (this.mixin_reconciliation_attempts) {
      delete this.mixin_reconciliation_attempts[hash];
    }
  }

  returnWrappedSaitoModule() {
    const crypto_mod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
    if (crypto_mod) {
      this.ercMod = crypto_mod;
    }
    return crypto_mod;
  }

  async reconcileMixinInbound(hash) {
    const payment = this.payment_cache[hash];
    if (!payment || payment.status !== 'awaiting_mixin') {
      this.clearMixinReconciliation(hash);
      return true;
    }

    const crypto_mod = this.returnWrappedSaitoModule();
    if (typeof crypto_mod?.findInboundPaymentBySignature !== 'function') {
      return false;
    }

    const amount = this.app.wallet.convertNolanToSaito(payment.nolan_received);

    try {
      const confirmed_payment = await crypto_mod.findInboundPaymentBySignature(
        hash,
        amount,
        payment.mixin,
        payment.created_at
      );

      if (confirmed_payment) {
        console.info(`Migration: reconciled confirmed Mixin deposit ${hash}`);
        await this.confirmMixinInbound(hash);
        return true;
      }
    } catch (err) {
      console.error(`Migration: unable to reconcile Mixin deposit ${hash}`, err);
    }

    return false;
  }

  scheduleMixinReconciliation(hash) {
    if (!hash || !this.payment_cache[hash] || this.mixin_reconciliation_timers?.[hash]) {
      return;
    }

    this.mixin_reconciliation_timers ||= {};
    this.mixin_reconciliation_attempts ||= {};

    const attempt = this.mixin_reconciliation_attempts[hash] || 0;
    const delays = this.mixin_reconciliation_delays || [];

    if (attempt >= delays.length) {
      delete this.mixin_reconciliation_attempts[hash];
      console.error(`Migration: timed out reconciling Mixin deposit ${hash}`);
      return;
    }

    this.mixin_reconciliation_attempts[hash] = attempt + 1;
    const timer = setTimeout(async () => {
      delete this.mixin_reconciliation_timers[hash];

      const confirmed = await this.reconcileMixinInbound(hash);
      if (!confirmed) {
        this.scheduleMixinReconciliation(hash);
      }
    }, delays[attempt]);

    // Do not keep a server process alive solely for a reconciliation retry.
    timer?.unref?.();
    this.mixin_reconciliation_timers[hash] = timer;
  }

  async resumeAwaitingMixin(row) {
    if (!row?.announcement_hash) {
      return;
    }

    const amount = this.app.wallet.convertNolanToSaito(row.nolan_received);
    const payment = { ...row, nolan_received: BigInt(row.nolan_received || 0) };

    this.payment_cache[row.announcement_hash] = payment;

    if (await this.reconcileMixinInbound(row.announcement_hash)) {
      return;
    }

    if (this.ercMod) {
      await this.app.wallet.receivePayment(
        this.wrapped_saito_ticker,
        row.mixin,
        amount,
        row.announcement_hash
      );
    }

    this.scheduleMixinReconciliation(row.announcement_hash);
  }

  returnServices() {
    let services = [];
    if (!this.app.BROWSER) {
      if (this.publicKey == this.migration_publickey) {
        services.push(new PeerService(null, 'migration'));
      }
    }
    return services;
  }

  webServer(app, expressapp, express) {
    expressapp.get(['/migration/apebond', '/migration/apebond/'], (req, res) => {
      res.sendFile(`${__dirname}/web/index.html`);
    });

    super.webServer(app, expressapp, express);
  }

  async onPeerServiceUp(app, peer, service = {}) {
    // Update migration service node address
    if (this.browser_active) {
      if (service.service == 'migration') {
        if (
          peer.publicKey === this.migration_publickey ||
          this.isMigrationTestDomain(this.returnMigrationHost())
        ) {
          this.migration_publickey = peer.publicKey;
        } else {
          console.warn('Ignoring an unexpected migration service provider', peer.publicKey);
        }
      }

      if (service.service == 'relay') {
        this.relay_available = true;
      }

      //
      // Make sure Mixin is online in case we need to create an account
      //
      if (service.service === 'mixin') {
        setTimeout(async () => {
          try {
            this.ercMod ||= this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
            if (this.ercMod) {
              await this.ercMod.activate();

              if (this.relay_available && this.ercMod?.address) {
                this.sendMigrationPingTransaction({ mixin_address: this.ercMod.formatAddress() });
                siteMessage('checking if automated migration available...', 2000);
                return;
              }
            } else {
              this.auto_migration_error =
                'Automated Migration requires Mixin and ERC modules to be installed.';
              this.main?.render();
              salert('Automated Migration requires Mixin and ERC modules to be installed!');
            }
          } catch (err) {
            console.error(err);
            this.auto_migration_error =
              'Unable to initialize the deposit address for automated migration.';
            this.main?.render();
            salert('Unable to initialize deposit address for automated migration');
          }
        }, 1000);
      }
    }
  }

  async render() {
    this.main = this.apebond.isActive() ? this.apebond : new MigrationMain(this.app, this);
    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);

    this.addComponent(this.main);
    this.addComponent(this.header);

    await super.render(this.app, this);

    // Set this on rendering... All modules will be initialized, so guaranteed to return if available.
    try {
      this.ercMod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
    } catch (err) {
      console.error(err);
    }
  }

  shouldAffixCallbackToModule(modname) {
    if (modname == this.name) {
      return 1;
    }

    // Monitor "ERC20" transactions - only!
    if (this.ercMod?.name == modname) {
      return 1;
    }

    return 0;
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx?.isTo(this.publicKey)) {
      let txmsg = tx.returnMessage();

      if (txmsg.request == 'migration accept') {
        await this.receiveMigrationResponseTransaction(app, tx, peer, mycallback);
      }

      if (txmsg.request == 'migration check') {
        await this.receiveMigrationPingTransaction(tx);
      }

      if (txmsg.request == 'migration failure') {
        if (this.app.BROWSER) {
          salert(
            'Uh oh, something went wrong with the automated migration. Please back up your wallet to ensure the security of your tokens and contact the team for a manual resolution.'
          );
        }
      }
    }
  }

  async onConfirmation(blk, tx, conf) {
    //
    // Just double checking that browsers only process what is addressed to them
    //
    if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
      return;
    }

    if (this.hasSeenTransaction(tx, blk)) {
      console.error('Migration is ignoring a duplicate transaction!!!!');
      return;
    }

    await tx.decryptMessage(this.app);

    let txmsg = tx.returnMessage();

    if (Number(conf) == 0) {
      if (txmsg.request === 'save migration data') {
        await this.receiveStoreMigrationTransaction(blk, tx, conf);
      }

      if (txmsg.request == 'migration check') {
        this.receiveMigrationPingTransaction(tx);
      }

      if (txmsg.request == 'migration issuance') {
        if (!this.app.BROWSER) {
          this.receiveMigrationIssuanceTransaction(tx, blk);
        }
      }

      if (txmsg.request === 'crypto payment') {
        if (this.app.BROWSER) {
          // Browsers will process receipt of funds (log and update UI) inside their crypto module
          return;
        }

        // tells the migration bot that the user's deposit is complete
        await this.receiveCryptoPaymentTransaction(tx, blk);
      }
    }
  }

  /**
   *  Send transaction for manual migration
   */
  async sendStoreMigrationTransaction(app, mod, data) {
    let obj = {
      module: this.name,
      request: 'save migration data',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = obj;
    await newtx.sign();
    await this.app.network.propagateTransaction(newtx);

    return newtx;
  }

  /**
   *  Send transaction for manual migration
   */
  async receiveStoreMigrationTransaction(blk, tx, conf) {
    try {
      //
      // browsers
      //
      if (this.app.BROWSER == 1) {
        return;
      }

      //
      // servers
      //
      let txmsg = tx.returnMessage();
      let sql = `INSERT INTO migration ( 
                  publickey,
                  erc20,
                  erc20_tx_id,
                  email,
                  saito_isssued,
                  created_at
                 )
                 VALUES ( 
                  $publickey,
                  $erc20,
                  '',
                  $email,
                  0,
                  $created_at
                 )`;
      let params = {
        $publickey: txmsg.data.pk,
        $erc20: txmsg.data.erc20,
        $email: txmsg.data.email,
        $created_at: tx.timestamp
      };
      await this.app.storage.runDatabase(sql, params, 'migration');
    } catch (err) {
      console.error('ERROR in saving migration data to db: ' + err);
    }
  }

  async sendFailureNotification(publickey) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(publickey);

    newtx.msg = {
      module: this.name,
      request: 'migration failure',
      data: null
    };

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);
  }

  /**
   * [BROWSER] Ping the Migration Bot to:
   * -- check its availability
   * -- let it cache my publickey & mixin account number
   * -- get its mixin account number
   *
   * We ping the migration bot twice. The first on-chain ping verifies the wallet
   * can propagate transactions and caches mixin↔pubkey. The second relay ping
   * (post-deposit) re-checks that the bot still has sufficient balance.
   */
  async sendMigrationPingTransaction(data, offchain = false) {
    if (!this.migration_publickey) {
      return;
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.migration_publickey
    );

    newtx.msg = {
      module: this.name,
      request: 'migration check',
      data
    };

    await newtx.sign();

    if (offchain) {
      this.app.connection.emit('relay-transaction', newtx);
    } else {
      await this.app.network.propagateTransaction(newtx);
    }
  }

  /**
   * [SERVER] Migration Bot respond to Ping
   * -- give user transfer details (address, max amount)
   * -- cache user's Saito public key and Mixin account number
   */
  async receiveMigrationPingTransaction(tx) {
    let txmsg = tx.returnMessage();
    let saitozen = tx.from[0].publicKey;

    // Only respond if I am the known migration bot
    if (this.app.BROWSER || this.publicKey !== this.migration_publickey) {
      return;
    }

    try {
      this.ercMod = this.returnWrappedSaitoModule();
      if (!this.ercMod) {
        throw new Error(`${this.wrapped_saito_ticker} is not installed`);
      }

      if (!this.ercMod.isActivated()) {
        const activated = await this.ercMod.activate();
        if (activated === false || !this.ercMod.isActivated()) {
          throw new Error(`${this.wrapped_saito_ticker} could not be activated`);
        }
      }
    } catch (err) {
      // failure state, take self off line
      this.ercMod = false;
      this.migration_publickey = '';
      this.services = [];
      console.error(err);
      return;
    }

    if (txmsg?.data?.mixin_address) {
      this.key_cache[txmsg.data.mixin_address] = saitozen;

      if (txmsg.data.double_check) {
        const is_apebond = txmsg.data.migration_type === 'apebond';
        this.apebond.intents[txmsg.data.mixin_address] = {
          migration_type: is_apebond ? 'apebond' : 'standard',
          email: is_apebond ? this.apebond.normalizeEmail(txmsg.data.email) : ''
        };
      } else {
        delete this.apebond.intents[txmsg.data.mixin_address];
      }
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(saitozen);

    let error = null;
    // Check balance

    let max_deposit = await this.app.wallet.getBalance('SAITO');
    max_deposit = Number(this.app.wallet.convertNolanToSaito(max_deposit));

    if (max_deposit > this.MAX_DEPOSIT) {
      max_deposit = this.MAX_DEPOSIT;
    } else {
      this.sendLowBalanceEmail(max_deposit);
    }

    let mixin_address = '';

    if (!this.ercMod) {
      error = `Migration bot doesn't have ERC20 Saito installed`;
    } else {
      mixin_address = this.ercMod.formatAddress();
    }

    if (max_deposit < 1000) {
      error = 'Insufficient balance in the Migration bot';
    }

    newtx.msg = {
      module: 'Migration',
      request: 'migration accept',
      data: {
        max_deposit,
        mixin_address,
        error,
        go: txmsg.data?.double_check
      }
    };

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);
  }

  async receiveMigrationResponseTransaction(app, tx, peer, mycallback) {
    if (!app.BROWSER) {
      return;
    }

    if (!tx?.isFrom(this.migration_publickey)) {
      console.warn('Ignoring a migration response from an unexpected sender');
      return;
    }

    let txmsg = tx.returnMessage();

    if (txmsg.data.error) {
      console.error(txmsg.data.error);
      this.auto_migration_error = String(txmsg.data.error);
      if (!txmsg.data.go) {
        this.can_auto = false;
      }
      if (this.apebond.isActive()) {
        this.apebond.treasury_error =
          txmsg.data.error || 'The Treasury Bot could not accept this migration.';
        this.apebond.render();
      }
      let btn = document.querySelector('button#automatic');
      if (btn) {
        btn.title = txmsg.data.error;
      }
      // We have deposited and want to finish the transfer, so need a more robust failure mode
      if (txmsg.data.go) {
        salert(
          'Migration Bot currently unable to process: \n' +
            txmsg.data.error +
            '\n Your ERC20 SAITO are safe on this wallet, you can refresh later to complete the migration'
        );
      } else if (!this.apebond.isActive()) {
        this.main.render();
      }
      return;
    }

    // Maybe the migration server changes the deposit address...
    this.migration_mixin_address = txmsg.data.mixin_address;
    this.max_deposit = txmsg.data.max_deposit;

    this.can_auto = true;
    this.auto_migration_error = '';
    this.apebond.treasury_error = '';

    let new_balance = Number(await this.ercMod.getAvailableBalance());

    if (txmsg.data?.go) {
      this.main.processDepositedSaito(new_balance);
    } else {
      // We are already sitting on some ERC20 wrapped SAITO
      this.balance = new_balance;
      this.main.render();
    }
  }

  async sendMigrationIssuanceTransaction(publicKey, saitoAmount, hash_id) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      publicKey,
      this.app.wallet.convertSaitoToNolan(saitoAmount)
    );

    newtx.msg = {
      module: 'Migration',
      request: 'migration issuance',
      amount: saitoAmount,
      hash: hash_id || ''
    };

    await newtx.sign();
    return newtx;
  }

  async recordMigrationIssuance(payment, tx) {
    const issuanceAt = Date.now();
    const serializedTx = tx.serialize_to_web(this.app);
    const sql = `UPDATE auto_migration
      SET status = 'issuing', tx_sig = $tx_sig, issuance_tx = $issuance_tx,
          issuance_at = $issuance_at
      WHERE id = $id AND status = 'pending'`;
    const params = {
      $id: payment.id,
      $tx_sig: tx.signature,
      $issuance_tx: serializedTx,
      $issuance_at: issuanceAt
    };

    const result = await this.app.storage.runDatabase(sql, params, 'migration');
    if (result?.changes === 0) {
      throw new Error(`Migration payment ${payment.id} is no longer available for issuance`);
    }

    payment.status = 'issuing';
    payment.tx_sig = tx.signature;
    payment.issuance_tx = serializedTx;
    payment.issuance_at = issuanceAt;
  }

  validateSavedMigrationIssuance(payment, tx) {
    const txmsg = tx.returnMessage();
    const expectedAmount = BigInt(payment.nolan_received);
    const hasExpectedOutput = tx.to.some(
      (slip) => slip.publicKey === payment.public_key && BigInt(slip.amount || 0) === expectedAmount
    );

    return (
      tx.signature === payment.tx_sig &&
      tx.isFrom(this.publicKey) &&
      tx.isTo(payment.public_key) &&
      hasExpectedOutput &&
      txmsg?.module === 'Migration' &&
      txmsg?.request === 'migration issuance' &&
      txmsg?.hash === (payment.announcement_hash || String(payment.id))
    );
  }

  async rebroadcastMigrationIssuance(payment) {
    if (!payment.issuance_tx || !payment.tx_sig) {
      if (!payment.missing_issuance_notified) {
        console.error(
          `Migration payment ${payment.id} is issuing without a saved signed transaction; manual review required`
        );
        payment.missing_issuance_notified = true;
      }
      return false;
    }

    const tx = new Transaction();
    tx.deserialize_from_web(this.app, payment.issuance_tx);
    if (!tx.signature || !this.validateSavedMigrationIssuance(payment, tx)) {
      throw new Error(`Migration payment ${payment.id} has invalid saved issuance data`);
    }

    await this.app.wallet.addTransactionToPending(tx, false);
    await this.app.network.propagateTransaction(tx);
    return true;
  }

  async confirmMigrationIssuancesInBlock(blk, lc) {
    if (!lc || !Array.isArray(blk?.transactions) || !blk.transactions.length) {
      return;
    }

    const issuing = this.pending_payments.filter((payment) => payment.status === 'issuing');
    if (!issuing.length) {
      return;
    }

    for (const tx of blk.transactions) {
      const txmsg = tx.returnMessage();
      const payment = issuing.find(
        (candidate) =>
          (candidate.tx_sig && candidate.tx_sig === tx.signature) ||
          (!candidate.tx_sig && candidate.announcement_hash === txmsg?.hash)
      );
      if (payment) {
        await this.receiveMigrationIssuanceTransaction(tx, blk);
      }
    }
  }

  async reconcileMigrationIssuances() {
    const issued = this.pending_payments.filter(
      (payment) =>
        payment.status === 'issuing' &&
        payment.tx_sig &&
        payment.issuance_tx &&
        Number(payment.issuance_at) > 0
    );
    const blockchain = this.app?.blockchain;
    if (!issued.length || !blockchain?.getLatestBlockId) {
      return;
    }

    const bySignature = new Map(issued.map((payment) => [payment.tx_sig, payment]));
    const earliestIssuance = Math.min(...issued.map((payment) => Number(payment.issuance_at)));
    const latestId = Number(await blockchain.getLatestBlockId());

    for (let id = latestId; id > 0 && bySignature.size; id--) {
      let block = null;
      try {
        const hash = await blockchain.getLongestChainHashAtId(id);
        if (!hash) {
          continue;
        }
        block = await blockchain.loadBlockAsync(String(hash));
        if (!block) {
          block = await blockchain.getBlock(String(hash), true);
        }
      } catch (_err) {
        continue;
      }
      if (!block) {
        continue;
      }

      for (const tx of block.transactions || []) {
        if (bySignature.has(tx?.signature)) {
          await this.receiveMigrationIssuanceTransaction(tx, block);
          bySignature.delete(tx.signature);
        }
      }

      if (Number(block.timestamp) < earliestIssuance) {
        break;
      }
    }
  }

  //
  // This should be confirmation that the Migration Bot's disbursement is onChain
  //
  async receiveMigrationIssuanceTransaction(tx, blk) {
    let txmsg = tx.returnMessage();

    const tx_payee = tx?.to[0]?.publicKey;

    console.log('receiveMigrationIssuanceTransaction: ', txmsg);

    if (tx.isFrom(this.publicKey)) {
      for (let i = 0; i < this.pending_payments.length; i++) {
        const pp = this.pending_payments[i];
        console.log(pp);
        if (
          tx.isTo(pp.public_key) &&
          pp.status == 'issuing' &&
          ((!pp.tx_sig && txmsg.hash == pp.announcement_hash) || tx.signature === pp.tx_sig)
        ) {
          pp.status = 'succeeded';
          try {
            await this.updatePayment(pp, {
              tx_sig: tx.signature,
              blk_id: Number(blk.id),
              issued_at: tx.timestamp
            });
          } catch (err) {
            pp.status = 'issuing';
            throw err;
          }

          this.notifyTeam(
            txmsg,
            tx_payee,
            2,
            `TX Signature: ${tx.signature}</p><p>Block ID: ${blk?.id}`,
            pp
          );
          this.apebond.sendUserMigrationConfirmation(pp);
          return;
        }
      }

      this.notifyTeam(
        txmsg,
        tx_payee,
        0,
        `TX Signature: ${tx.signature}</p><p>Block ID: ${blk?.id}</p><p>(Migration) payment not found in pending transactions... `
      );
    }
  }

  async receiveCryptoPaymentTransaction(tx, blk) {
    let txmsg = tx.returnMessage();

    const tx_sender = tx?.from[0]?.publicKey;
    const { amount, from } = txmsg;

    // Quietly fail if receiving anything other than ERC-20 because other modules might care
    if (txmsg.module !== this.wrapped_saito_ticker) {
      return;
    }

    if (tx.isTo(this.publicKey)) {
      //  module: 'ERC-SAITO',
      //  request: 'crypto payment',
      //  amount: '36293.58109136',
      //  from: '0x9e97e4c1201E961F6586fC5293b801e9e0d07859|e15bbf5b-f385-348f-b1a8-31ba2b0aae12|mixin',
      //  to: '0x1f7Fb1952bAd0be96d61971a95d1Ca1cA8b21A17|60b3be17-a4f7-363a-a2c7-06dc1f25bee9|mixin',
      //  hash: 'ce23e0df0c53a9605834101d71d89fcf84cf3f52757850856ca9074ba9a63017'

      if (!txmsg.hash) {
        this.notifyTeam(txmsg, tx_sender, 0, 'ERC-SAITO crypto payment missing announcement hash');
        console.error('Migration: announcement missing hash');
        return;
      }

      const existing = await this.findAutoMigrationByAnnouncementHash(txmsg.hash);
      if (existing) {
        console.info('Migration: duplicate announcement for hash', txmsg.hash);
        return;
      }

      const newPayment = {
        public_key: tx_sender,
        mixin: from,
        nolan_received: this.app.wallet.convertSaitoToNolan(amount),
        created_at: tx.timestamp,
        status: 'awaiting_mixin',
        ticker: txmsg.module,
        announcement_hash: txmsg.hash
      };

      const intent = this.apebond.intents[from] || {};
      newPayment.migration_type = intent.migration_type === 'apebond' ? 'apebond' : 'standard';
      newPayment.email =
        newPayment.migration_type === 'apebond' ? this.apebond.normalizeEmail(intent.email) : '';
      delete this.apebond.intents[from];

      let saitozen_key = this.key_cache[from];

      if (!saitozen_key || !tx.isFrom(saitozen_key)) {
        this.notifyTeam(
          txmsg,
          tx_sender,
          0,
          `Received a ${txmsg.module.toUpperCase()} transaction from an unknown sender!!`,
          newPayment
        );

        newPayment.status = 'failed';
        await this.savePendingPayment(newPayment, false);
        console.error('Process a crypto transfer from an unknown sender!!!');
        return;
      }

      await this.savePendingPayment(newPayment, false);
      await this.resumeAwaitingMixin(newPayment);
    }
  }

  async savePendingPayment(payment, add_to_queue = true) {
    let sql = `INSERT INTO auto_migration ( 
                public_key,
                  mixin,
                  nolan_received,
                  created_at,
                  status,
                  ticker,
                  announcement_hash,
                  migration_type,
                  email
                 )
                 VALUES ( 
                $public_key,
                  $mixin,
                  $nolan_received,
                  $created_at,
                  $status,
                  $ticker,
                  $announcement_hash,
                  $migration_type,
                  $email
                     )`;
    let params = {
      $public_key: payment.public_key,
      $mixin: payment.mixin,
      $nolan_received: Number(payment.nolan_received),
      $created_at: payment.created_at,
      $status: payment.status,
      $ticker: payment.ticker,
      $announcement_hash: payment.announcement_hash || '',
      $migration_type: payment.migration_type || 'standard',
      $email: payment.email || ''
    };

    let res;
    try {
      const db = await this.app.storage.returnDatabaseByName('migration');
      res = await db.run(sql, params);
    } catch (err) {
      const reason = err?.message || String(err);
      const reference = payment.announcement_hash || 'without-announcement-hash';
      throw new Error(`Migration failed to save payment ${reference}: ${reason}`);
    }

    if (!res?.lastID) {
      const reference = payment.announcement_hash || 'without-announcement-hash';
      throw new Error(`Migration failed to save payment ${reference}: no database row ID returned`);
    }
    payment.id = res.lastID;

    if (add_to_queue) {
      this.pending_payments.push(payment);
    }
  }

  async updatePayment(payment, data = null) {
    if (!payment?.id) {
      console.error('No known ID for pending payment...');
      return;
    }

    let sql = `UPDATE auto_migration SET status = $status`;
    let params = {
      $id: payment.id,
      $status: payment.status
    };

    if (data) {
      sql += `, tx_sig = $tx_sig, blk_id = $blk_id, issued_at = $issued_at`;

      params['$tx_sig'] = data.tx_sig;
      params['$blk_id'] = data.blk_id;
      params['$issued_at'] = data.issued_at;
    }

    sql += ` WHERE id = $id`;

    await this.app.storage.runDatabase(sql, params, 'migration');

    if (data) {
      Object.assign(payment, data);
    }
  }

  /**
   * On new block (assuming we get a slip back), try to clear out the payments queue
   */
  async onNewBlock(blk, lc) {
    if (this.app.BROWSER || !lc) {
      return;
    }

    await this.confirmMigrationIssuancesInBlock(blk, lc);

    if (this.processing_payments) {
      return;
    }

    this.processing_payments = true;

    try {
      if (this.pending_payments?.length) {
        for (const pp of this.pending_payments) {
          if (
            pp.status === 'issuing' &&
            (!pp.last_rebroadcast_block || Number(blk.id) - pp.last_rebroadcast_block >= 3)
          ) {
            try {
              if (await this.rebroadcastMigrationIssuance(pp)) {
                pp.last_rebroadcast_block = Number(blk.id);
              }
            } catch (err) {
              console.error(`Failed to rebroadcast migration payment ${pp.id}:`, err);
            }
          }
        }

        for (let i = 0; i < this.pending_payments.length; i++) {
          if (this.pending_payments[i].status == 'pending') {
            const pp = this.pending_payments[i];
            const amount = this.app.wallet.convertNolanToSaito(pp.nolan_received);
            const saitozen_key = pp.public_key;

            const data_for_email = {
              module: pp.ticker,
              from: pp.mixin,
              amount
            };

            let sm = this.app.wallet.returnCryptoModuleByTicker('SAITO');
            let pending_balance = Number(await sm.getPendingBalance());

            try {
              const tx = await this.sendMigrationIssuanceTransaction(
                saitozen_key,
                amount,
                pp.announcement_hash || String(pp.id)
              );

              // Persist the exact signed transaction before it becomes observable.
              // A restart can then only rebroadcast this signature, never pay twice.
              await this.recordMigrationIssuance(pp, tx);
              await this.app.wallet.addTransactionToPending(tx);
              await this.app.network.propagateTransaction(tx);
              pp.last_rebroadcast_block = Number(blk.id);

              // Submitted, but not complete until receiveMigrationIssuanceTransaction
              // sees this exact signature in a longest-chain block.
              this.notifyTeam(data_for_email, saitozen_key, 1, null, pp);
            } catch (err) {
              if (pp.status === 'issuing') {
                // The signed payout is durable. Leave it issuing so the exact same
                // transaction is retried; generating a replacement could double-pay.
                console.error(`Migration payment ${pp.id} saved but not propagated:`, err);
              } else if (pending_balance && pending_balance > amount) {
                console.info(
                  '666.777 --- insufficient slips to migrate SAITO keep active in queue'
                );
              } else {
                this.notifyTeam(data_for_email, saitozen_key, 0, err, pp);
                console.error('666.777 --- ', err);
                pp.status = 'failed';
                this.sendFailureNotification(saitozen_key);
                await this.updatePayment(pp);
              }
            }

            // Max - one issuance per block
            return;
          }
        }
      }
    } finally {
      this.processing_payments = false;
    }
  }

  async load() {
    await this.ensureAutoMigrationSchema();

    let sql = `SELECT * FROM auto_migration WHERE status IN ('awaiting_mixin','pending','issuing')`;
    let params = {};

    let sqlResults = await this.app.storage.queryDatabase(sql, params, 'migration');

    if (sqlResults.length > 0) {
      for (let s of sqlResults) {
        if (s.nolan_received) {
          s.nolan_received = BigInt(s.nolan_received || 0);
          s.announcement_hash = s.announcement_hash || '';

          if (s.status === 'pending' || s.status === 'issuing') {
            this.pending_payments.push(s);
          }

          if (s.status === 'awaiting_mixin' && s.announcement_hash) {
            await this.resumeAwaitingMixin(s);
          }
        }
      }
    }

    await this.reconcileMigrationIssuances();
  }

  async ensureAutoMigrationSchema() {
    const db = await this.app.storage.returnDatabaseByName('migration');

    // options.modules can say Migration is installed even when a deployment has
    // copied options without its database, so creation must also be safe at startup.
    await db.run(autoMigrationTableSql());

    const columns = await db.all('PRAGMA table_info(auto_migration)');
    const column_names = new Set(columns.map((column) => column.name));
    const required_columns = [
      'id',
      'public_key',
      'ticker',
      'mixin',
      'nolan_received',
      'created_at',
      'status',
      'tx_sig',
      'blk_id',
      'issued_at'
    ];
    const missing_required_columns = required_columns.filter(
      (column_name) => !column_names.has(column_name)
    );

    if (missing_required_columns.length) {
      throw new Error(
        `Migration database has an unsupported auto_migration schema; missing: ${missing_required_columns.join(
          ', '
        )}`
      );
    }

    for (const [column_name, definition] of Object.entries(AUTO_MIGRATION_OPTIONAL_COLUMNS)) {
      if (!column_names.has(column_name)) {
        await db.run(`ALTER TABLE auto_migration ADD COLUMN ${column_name} ${definition}`);
        column_names.add(column_name);
      }
    }

    const table = await db.get(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auto_migration'`
    );
    if (!table?.sql) {
      throw new Error('Migration database is missing the auto_migration table definition');
    }

    if (!table.sql.includes('awaiting_mixin')) {
      let transaction_started = false;
      try {
        await db.exec('BEGIN IMMEDIATE');
        transaction_started = true;
        await db.exec('DROP TABLE IF EXISTS auto_migration_upgrade');
        await db.run(autoMigrationTableSql('auto_migration_upgrade'));
        await db.run(`INSERT INTO auto_migration_upgrade (
          id, public_key, ticker, mixin, nolan_received, created_at, status,
          tx_sig, issuance_tx, issuance_at, blk_id, issued_at,
          announcement_hash, migration_type, email
        ) SELECT
          id, public_key, ticker, mixin, nolan_received, created_at, status,
          tx_sig, issuance_tx, issuance_at, blk_id, issued_at,
          announcement_hash, migration_type, email
        FROM auto_migration`);
        await db.exec('DROP TABLE auto_migration');
        await db.exec('ALTER TABLE auto_migration_upgrade RENAME TO auto_migration');
        await db.exec('COMMIT');
      } catch (err) {
        if (transaction_started) {
          try {
            await db.exec('ROLLBACK');
          } catch {}
        }
        const reason = err?.message || String(err);
        throw new Error(`Migration database schema upgrade failed: ${reason}`);
      }
    }
  }

  /**
   * Format and send email for record keeping
   * data aka txmsg { module, amount, to, from }
   */
  async notifyTeam(data, pk, result, msg, payment = null) {
    let emailtext;
    let subject = `Saito Token Automated Migration Alert`;

    if (this.apebond.isApeBondPayment(payment)) {
      subject = `Saito Ape Bond Automated Migration Alert`;
    }

    // 2 -> Whole process confirmed onChain, tokens migrated!
    if (result == 2) {
      let x = await this.app.wallet.getBalance();
      let y = this.app.wallet.convertNolanToSaito(x);

      subject += ' (Complete!)';
      emailtext = `
          <div>
              <p>Saito Automated Migration Complete!</p>
              <hr>
                <p>Migration Bot issued ${this.app.browser.formatDecimals(data.amount, true)} ${data.module} to ${pk}</p>
              <p></p>
              <p>${msg}</p>
                <p>Remaining BALANCE: ${this.app.browser.formatDecimals(y)}</p>
             </div>
            `;

      if (Number(y) < this.MAX_DEPOSIT) {
        this.sendLowBalanceEmail(Number(y));
      }
    } else {
      emailtext = `
            <div>
            <p>Saito Automated Migration Transfer Service</p>
            <hr>
            <p>Tokens received by Migration Bot:</p>
            <p>TICKER: ${data.module} </p>
              <p>AMOUNT: ${this.app.browser.formatDecimals(data.amount, true)} </p>
              <p>FROM: ${data.from}</p>
              <p>PUBLICKEY: ${pk}</p>
            <p></p>
            `;

      // 1 -> sent tokens to Saitozen, but not confirmed
      if (result) {
        subject += ' (Submitted)';
        emailtext += `<p>Signed SAITO payout submitted; awaiting on-chain confirmation.</p></div>`;
      } else {
        subject += ' (Error)';
        emailtext += `<p>Error: ${msg}</p></div>`;
      }
    }

    emailtext += this.apebond.returnTeamEmailHTML(payment);

    console.info('666.777 --- Sending Notification Email');
    this.app.connection.emit('mailrelay-send-email', {
      to: 'migration@saito.tech',
      from: 'Saito Token Migration <info@saito.tech>',
      subject,
      html: emailtext,
      ishtml: true,
      bcc: 'migration@saito.io'
    });
  }

  sendLowBalanceEmail(balance) {
    let ts = Date.now();
    if (this.last_warning_email && ts - this.last_warning_email < 12 * 60 * 60 * 1000) {
      // Let's not spam Richard's inbox with these...
      // No more than once every 12 hours
      return;
    }
    this.last_warning_email = ts;
    console.info('666.777 --- Sending Low Balance Email');
    this.app.connection.emit('mailrelay-send-email', {
      to: 'migration@saito.tech',
      from: 'Saito Token Migration <info@saito.tech>',
      subject: `Low Balance Warning: ${this.app.browser.formatDecimals(balance)}`,
      text: `Please deposit more SAITO ASAP`,
      bcc: 'migration@saito.io'
    });
  }
}

module.exports = Migration;
