const ModTemplate = require('./../../lib/templates/modtemplate');
const MigrationMain = require('./lib/main');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');

const PeerService = require('saito-js/lib/peer_service').default;

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

    this.wrapped_saito_ticker = 'ERC-SAITO';
    this.MAX_DEPOSIT = 500000; // Max of 500k at a time

    this.relay_available = false;
    this.can_auto = false;
    this.ercMod = null;

    this.local_dev = false;

    //this.migration_publickey = 'zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK';
    this.migration_publickey = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';
    this.migration_mixin_address = '';

    return this;
  }

  async initialize(app) {
    await super.initialize(app);

    if (!this.app.BROWSER) {
      if (app.options?.server?.endpoint?.host == 'localhost') {
        this.local_dev = true;
      } else {
        this.local_dev = false;
      }

      if (this.local_dev) {
        this.migration_publickey = this.publicKey;
        console.warn('---> I am the migration bot for local testing!!!!');
      }

      if (this.publicKey === this.migration_publickey) {
        await this.ensureAutoMigrationSchema();
        await this.load();

        // ERC-SAITO inbound confirmed via CryptoModule receivePayment polling
        this.app.connection.on('on-receive-expected-payment', (hash, details) => {
          // Secondary stricter checks
          if (details.ticker !== this.ercMod?.ticker) {
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

  async ensureAutoMigrationSchema() {
    const db = await this.app.storage.returnDatabaseByName('migration');
    const columns = await db.all('PRAGMA table_info(auto_migration)');

    if (!columns.length) {
      throw new Error('Migration: auto_migration table is missing');
    }

    const columnNames = new Set(columns.map((column) => column.name));
    const table = await db.get(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auto_migration'`
    );
    const expectedColumns = [
      'id',
      'public_key',
      'ticker',
      'mixin',
      'nolan_received',
      'created_at',
      'status',
      'tx_sig',
      'blk_id',
      'issued_at',
      'announcement_hash'
    ];
    const retainedColumns = columns
      .map((column) => column.name)
      .filter((column) => expectedColumns.includes(column));
    const comparableExpectedColumns = expectedColumns.filter((column) => columnNames.has(column));
    const tailNeedsUpgrade =
      !/awaiting_mixin/.test(table?.sql || '') ||
      !columnNames.has('announcement_hash') ||
      retainedColumns.join(',') !== comparableExpectedColumns.join(',');
    const legacyColumns = ['issuance_tx', 'issuance_at', 'migration_type', 'email'].filter(
      (column) => columnNames.has(column)
    );

    if (!tailNeedsUpgrade && legacyColumns.length === 0) {
      return;
    }

    const statements = [];
    if (tailNeedsUpgrade) {
      const tailColumns = ['status', 'tx_sig', 'blk_id', 'issued_at', 'announcement_hash'];
      const definitions = {
        status: `TEXT DEFAULT 'pending' CHECK (status IN ('awaiting_mixin','pending','issuing','succeeded','failed'))`,
        tx_sig: 'TEXT DEFAULT ""',
        blk_id: 'INTEGER DEFAULT 0',
        issued_at: 'INTEGER DEFAULT 0',
        announcement_hash: 'TEXT DEFAULT ""'
      };
      const preservedColumns = tailColumns.filter((column) => columnNames.has(column));

      for (const column of preservedColumns) {
        if (columnNames.has(`${column}_legacy`)) {
          throw new Error(`Migration: auto_migration.${column}_legacy already exists`);
        }
        statements.push(`ALTER TABLE auto_migration RENAME COLUMN ${column} TO ${column}_legacy`);
      }
      for (const column of tailColumns) {
        statements.push(`ALTER TABLE auto_migration ADD COLUMN ${column} ${definitions[column]}`);
      }
      for (const column of preservedColumns) {
        statements.push(`UPDATE auto_migration SET ${column} = ${column}_legacy`);
      }
      for (const column of preservedColumns) {
        statements.push(`ALTER TABLE auto_migration DROP COLUMN ${column}_legacy`);
      }
    }
    for (const column of legacyColumns) {
      statements.push(`ALTER TABLE auto_migration DROP COLUMN ${column}`);
    }

    await db.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) {
        await db.exec(statement);
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {});
      throw error;
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
      console.warn("Inbound Mixin doesn't match expected payment...");
      console.log(this.payment_cache);
      return;
    }

    payment.status = 'pending';
    await this.updatePayment(payment);

    if (!this.pending_payments.some((p) => p.id === payment.id)) {
      this.pending_payments.push(payment);
    }

    delete this.payment_cache[hash];
  }

  async resumeAwaitingMixin(row) {
    if (!row?.announcement_hash) {
      return;
    }

    const amount = this.app.wallet.convertNolanToSaito(row.nolan_received);
    const payment = { ...row, nolan_received: BigInt(row.nolan_received || 0) };

    this.payment_cache[row.announcement_hash] = payment;

    await this.app.wallet.receivePayment(
      this.wrapped_saito_ticker,
      row.mixin,
      amount,
      row.announcement_hash
    );
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

  async onPeerServiceUp(app, peer, service = {}) {
    // Update migration service node address
    if (this.browser_active) {
      if (service.service == 'migration') {
        console.warn('---> update public key of Migration bot for local testing!!!!');
        this.migration_publickey = peer.publicKey;
        this.local_dev = true;
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
            if (this.ercMod) {
              await this.ercMod.activate();

              if (this.relay_available && this.ercMod?.address) {
                this.sendMigrationPingTransaction({ mixin_address: this.ercMod.formatAddress() });
                siteMessage('checking if automated migration available...', 2000);
                return;
              }
            } else {
              salert('Automated Migration requires Mixin and ERC modules to be installed!');
            }
          } catch (err) {
            console.error(err);
            salert('Unable to initialize deposit address for automated migration');
          }
        }, 1000);
      }
    }
  }

  async render() {
    this.main = new MigrationMain(this.app, this);
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
        this.receiveCryptoPaymentTransaction(tx, blk);
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
    if (this.publicKey != this.migration_publickey) {
      return;
    }

    if (!this.ercMod) {
      try {
        this.ercMod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
        await this.ercMod.activate();
      } catch (err) {
        // failure state, take self off line
        this.ercMod = false;
        this.migration_publickey = '';
        this.services = [];
        console.error(err);
        return;
      }
    }

    if (txmsg?.data?.mixin_address) {
      this.key_cache[txmsg.data.mixin_address] = saitozen;
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
      error = "Migration bot doesn't have ERC20 Saito installed";
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
    if (app.BROWSER) {
      let txmsg = tx.returnMessage();

      if (txmsg.data.error) {
        console.error(txmsg.data.error);
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
        }
        return;
      }

      // Maybe the migration server changes the deposit address...
      this.migration_mixin_address = txmsg.data.mixin_address;
      this.max_deposit = txmsg.data.max_deposit;

      this.can_auto = true;

      let new_balance = Number(await this.ercMod.getAvailableBalance());

      if (txmsg.data?.go) {
        if (this.local_dev) {
          new_balance = Math.round(10000000000 * Math.random());
          new_balance = new_balance / 2000000; // 20000  --> 5k max
        }

        this.main.processDepositedSaito(new_balance);
      } else {
        // We are already sitting on some ERC20 wrapped SAITO
        this.balance = new_balance;
        this.main.render();
      }
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
    await this.app.network.propagateTransaction(newtx);

    return newtx.signature;
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
          await this.updatePayment(pp, {
            tx_sig: tx.signature,
            blk_id: Number(blk.id),
            issued_at: tx.timestamp
          });

          this.notifyTeam(
            txmsg,
            tx_payee,
            2,
            `TX Signature: ${tx.signature}</p><p>Block ID: ${blk?.id}`
          );
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

      let saitozen_key = this.key_cache[from];

      if (!saitozen_key || !tx.isFrom(saitozen_key)) {
        this.notifyTeam(
          txmsg,
          tx_sender,
          0,
          `Received a ${txmsg.module.toUpperCase()} transaction from an unknown sender!!`
        );

        newPayment.status = 'failed';
        this.savePendingPayment(newPayment, false);
        console.error('Process a crypto transfer from an unknown sender!!!');
        return;
      }

      await this.savePendingPayment(newPayment, false);
      this.payment_cache[txmsg.hash] = newPayment;
      await this.app.wallet.receivePayment(this.wrapped_saito_ticker, from, amount, txmsg.hash);

      if (this.local_dev) {
        console.info('Migration local_dev: confirming inbound without Mixin poll');
        await this.confirmMixinInbound(txmsg.hash);
      }
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
                  announcement_hash
                 )
                 VALUES ( 
                $public_key,
                  $mixin,
                  $nolan_received,
                  $created_at,
                  $status,
                  $ticker,
                  $announcement_hash
                     )`;
    let params = {
      $public_key: payment.public_key,
      $mixin: payment.mixin,
      $nolan_received: Number(payment.nolan_received),
      $created_at: payment.created_at,
      $status: payment.status,
      $ticker: payment.ticker,
      $announcement_hash: payment.announcement_hash || ''
    };

    let res = await this.app.storage.runDatabase(sql, params, 'migration');

    if (res.lastID) {
      payment.id = res.lastID;
    }

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
      Object.assign(payment, data);

      sql += `, tx_sig = $tx_sig, blk_id = $blk_id, issued_at = $issued_at`;

      params['$tx_sig'] = data.tx_sig;
      params['$blk_id'] = data.blk_id;
      params['$issued_at'] = data.issued_at;
    }

    sql += ` WHERE id = $id`;

    await this.app.storage.runDatabase(sql, params, 'migration');
  }

  /**
   * On new block (assuming we get a slip back), try to clear out the payments queue
   */
  async onNewBlock(blk, lc) {
    if (this.app.BROWSER) {
      return;
    }
    if (this.pending_payments?.length) {
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
            pp.tx_sig = await this.sendMigrationIssuanceTransaction(
              saitozen_key,
              amount,
              pp.announcement_hash || String(pp.id)
            );

            // Success!
            this.notifyTeam(data_for_email, saitozen_key, 1);
            pp.status = 'issuing';
            await this.updatePayment(pp);
          } catch (err) {
            // Failure!
            if (pending_balance && pending_balance > amount) {
              console.info('666.777 --- insufficient slips to migrate SAITO keep active in queue');
            } else {
              this.notifyTeam(data_for_email, saitozen_key, 0, err);
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
  }

  async load() {
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

          if (s.status === 'awaiting_mixin' && s.announcement_hash && !this.local_dev) {
            await this.resumeAwaitingMixin(s);
          }
        }
      }
    }
  }

  /**
   * Format and send email for record keeping
   * data aka txmsg { module, amount, to, from }
   */
  async notifyTeam(data, pk, result, msg) {
    let emailtext;
    let subject = `Saito Token Automated Migration Alert`;

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
        subject += ' (Success!)';
        emailtext += `<p>Disbursing SAITO!</p></div>`;
      } else {
        subject += ' (Error)';
        emailtext += `<p>Error: ${msg}</p></div>`;
      }
    }

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
