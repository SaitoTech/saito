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
        await this.load();
      }

      return;
    }
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

    // Monitor "crypto" transactions

    const my_cryptos = this.app.wallet.returnInstalledCryptos(false);

    for (let mc of my_cryptos) {
      if (mc.name == modname) {
        return 1;
      }
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

    if (this.hasSeenTransaction(tx, Number(blk.id))) {
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
   * We ping the migration bot twice. The first time on chain to make sure that
   * our account is able to send onChain transactions (wallet version not screwed up)
   *
   * And the second time to confirm that the bot still has sufficient balance for the transfer
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
    if (!this.publicKey == this.migration_publickey) {
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

    //
    // Save the key on the secondary off-chain confirmation
    //
    if (txmsg?.data?.double_check) {
      this.key_cache[txmsg.data.mixin_address] = saitozen;
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(saitozen);

    let error = null;
    // Check balance

    let min_deposit = 0;
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
        min_deposit,
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
          new_balance = new_balance / 20000; // 20000  --> 500k max
        }

        this.main.processDepositedSaito(new_balance);
      } else {
        // We are already sitting on some ERC20 wrapped SAITO
        this.balance = new_balance;
        this.main.render();
      }
    }
  }

  async receiveCryptoPaymentTransaction(tx, blk) {
    let txmsg = tx.returnMessage();

    const tx_sender = tx?.from[0]?.publicKey;
    const { amount, from } = txmsg;

    //
    // This should be confirmation that the Migration Bot's disbursement is onChain
    //
    if (tx.isFrom(this.publicKey)) {
      for (let i = 0; i < this.pending_payments.length; i++) {
        if (
          tx.isTo(this.pending_payments[i].public_key) &&
          this.pending_payments[i].status == 'issuing' &&
          amount == this.app.wallet.convertNolanToSaito(this.pending_payments[i].nolan_received)
        ) {
          this.pending_payments[i].status = 'succeeded';
          await this.updatePayment(this.pending_payments[i], {
            tx_sig: tx.signature,
            blk_id: Number(blk.id),
            issued_at: tx.timestamp
          });

          this.notifyTeam(
            txmsg,
            tx_sender,
            2,
            `TX Signature: ${tx.signature}</p><p>Block ID: ${blk?.id}`
          );
          return;
        }
      }

      this.notifyTeam(
        txmsg,
        tx_sender,
        0,
        `TX Signature: ${tx.signature}</p><p>Block ID: ${blk?.id}</p><p>(Migration) payment not found in pending transactions... `
      );
    }

    //
    if (tx.isTo(this.publicKey)) {
      //  module: 'ERC-SAITO',
      //  request: 'crypto payment',
      //  amount: '36293.58109136',
      //  from: '0x9e97e4c1201E961F6586fC5293b801e9e0d07859|e15bbf5b-f385-348f-b1a8-31ba2b0aae12|mixin',
      //  to: '0x1f7Fb1952bAd0be96d61971a95d1Ca1cA8b21A17|60b3be17-a4f7-363a-a2c7-06dc1f25bee9|mixin',
      //  hash: 'ce23e0df0c53a9605834101d71d89fcf84cf3f52757850856ca9074ba9a63017'

      if (txmsg.module !== this.wrapped_saito_ticker) {
        this.notifyTeam(txmsg, tx_sender, false, 'Received unexpected crypto payment!!');
        console.error('Processing a crypto transfer tx for something other than ERC-SAITO!!');
        return;
      }

      const newPayment = {
        public_key: tx_sender,
        mixin: from,
        nolan_received: this.app.wallet.convertSaitoToNolan(amount),
        created_at: tx.timestamp,
        status: 'pending',
        ticker: txmsg.module,
        hash: txmsg.hash
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

      if (this.local_dev) {
        console.info('Disbursing Saito without verification because local testing...');
        this.savePendingPayment(newPayment);
      } else {
        //
        // Mixin will handle polling of the recent transactions and emit an event when we confirm the funds transfer
        // so we need to rewrite this...
        //
        /*this.ercMod.fetchHistory(0, (history) => {
          for (let h of history) {
            if (h.counter_party?.address) {
              if (txmsg.from.includes(h.counter_party?.address)) {
                if (Number(amount) == h.amount) {
                  console.info("Payment 'Verified' in Mixin history");
                  this.savePendingPayment(newPayment);
                  return;
                }
              }
            }
          }
        });*/
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
                  ticker
                 )
                 VALUES ( 
                $public_key,
                  $mixin,
                  $nolan_received,
                  $created_at,
                  $status,
                  $ticker
                     )`;
    let params = {
      $public_key: payment.public_key,
      $mixin: payment.mixin,
      $nolan_received: Number(payment.nolan_received),
      $created_at: payment.created_at,
      $status: payment.status,
      $ticker: payment.ticker
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

          await sm
            .sendPayment(amount, saitozen_key, pp.hash + 1, 'token migration')
            .then(() => {
              this.notifyTeam(data_for_email, saitozen_key, 1);
              pp.status = 'issuing';
              this.updatePayment(pp);
            })
            .catch((err) => {
              if (pending_balance && pending_balance > amount) {
                console.info(
                  '666.777 --- insufficient slips to migrate SAITO keep active in queue'
                );
              } else {
                this.notifyTeam(data_for_email, saitozen_key, 0, err);
                console.error('666.777 --- ', err);
                pp.status = 'failed';
                this.sendFailureNotification(saitozen_key);
                this.updatePayment(pp);
              }
            });

          //return;
        }
      }
    }
  }

  async load() {
    let sql = `SELECT * FROM auto_migration WHERE status = 'issuing' OR status = 'pending'`;
    let params = {};

    let sqlResults = await this.app.storage.queryDatabase(sql, params, 'migration');

    if (sqlResults.length > 0) {
      for (let s of sqlResults) {
        if (s.nolan_received) {
          s.hash = Number(Math.random().toString().substring(2));
          s.nolan_received = BigInt(s.nolan_received || 0);
          this.pending_payments.push(s);
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
                <p>Migration Bot issued ${this.app.browser.formatDecimals(data.amount, true)} ${data.module} to ${data.to}</p>
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
        if (result === false) {
          subject += ' (Warning)';
        } else {
          subject += ' (Error)';
        }
        // Something went wrong!!!
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
