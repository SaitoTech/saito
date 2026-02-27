const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const BuySaitoHome = require('./index');
const SaitoPurchaseOverlay = require('./lib/saito-purchase');

//
//

class BuySaito extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'BuySaito';
    this.slug = 'buy';
    this.dbname = 'buysaito';

    this.dependencies = ['Relay', 'Mixin', 'ERC'];
    this.description = 'Testnet BuySaito for Testing and Application Development';
    this.categories = 'Utility Ecommerce NFTs';

    this.social = {
      twitter: '@SaitoOfficial',
      title: '🟥 Saito BuySaito',
      url: 'https://saito.io/buysaito/',
      description: 'Get Testnet Saito',
      image: 'https://saito.tech/wp-content/uploads/2023/11/buysaito-300x300.png'
    };

    this.mixin_mod = null;
    this.erc_saito = null;
    this.time_limit = 25 * 60000;
    // For the full node, to juggle multiple deposit addresses
    this.mixin_accounts = [];

    /* A list of payments to handle
       stored in a DB every time a status is updated and restored on load for 
       persistence across server down time

    */
    this.pending_payments = [];

    this.authorized_public_key = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';

    this.available_currencies = [];

    // turn this on to fake receiving a mixin payment and test out the UX flow
    this.local_dev = false;

    this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
  }

  async initialize(app) {
    await super.initialize(app);

    if (!this.app.BROWSER) {
      this.mixin_mod = app.modules.returnModule('Mixin');
      if (
        app.options?.server?.endpoint?.host == 'localhost' ||
        app.options?.server?.endpoint?.host.includes('staging') ||
        app.options?.server?.host.includes('staging')
      ) {
        console.warn('BUYSAITO ---> Local development mode');
        this.authorized_public_key = this.publicKey;
      } else {
        this.local_dev = false;
      }

      setTimeout(() => {
        if (this.mixin_mod && this.authorized_public_key === this.publicKey) {
          console.log('BUYSAITO --> Iniitalize Mixin Mod!!');
          this.mixin_mod.createAccount();
          this.loadAltAccounts();
          this.loadPendingPayments();
          this.checkPrices();
        }
      }, 2000);
    }
  }

  returnServices() {
    let services = [];
    if (!this.app.BROWSER) {
      if (this.publicKey == this.authorized_public_key) {
        console.log('BUYSAITO ---> I provide saito selling services!!!!');
        services.push(new PeerService(null, 'buysaito'));
      }
    }
    return services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    //
    // If our direct peer is the BuySaito service provider,
    // make sure we update the publickey we send requests to
    //
    if (service.service === 'buysaito') {
      this.authorized_public_key = peer.publicKey;
      console.warn(
        'BUYSAITO ---> set public key of authorized Saito seller!!!!',
        this.authorized_public_key
      );
    }

    if (service.service == 'relay') {
      if (this.browser_active) {
        if (document.getElementById('buysaito-button')) {
          document.getElementById('buysaito-button').disabled = false;
        }
      }
    }
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.header.header_class = 'arcade';
      this.addComponent(this.header);
    }

    await super.render();

    if (this.pending_payments.length) {
      if (document.querySelector('.purchase-saito-prompt')) {
        document.querySelector('.purchase-saito-prompt').visibility = 'hidden';
      }
      if (document.getElementById('buysaito-button')) {
        document.getElementById('buysaito-button').innerText = 'Continue';
      }
    }

    // Called by modules.ts!!!
    //this.attachEvents();
  }

  attachEvents() {
    let btn = document.getElementById('buysaito-button');
    const purchaseAmountInput = document.getElementById('purchase-saito-amount');

    if (btn) {
      btn.onclick = (e) => {
        if (this.pending_payments.length) {
          this.app.connection.emit('saito-purchase-address-reserved', this.pending_payments[0]);
          return;
        }

        const amount = purchaseAmountInput.value;
        this.app.connection.emit('saito-purchase-launch', amount);
      };
    }

    if (purchaseAmountInput) {
      purchaseAmountInput.addEventListener('change', (e) => {
        e.stopPropagation();
        if (purchaseAmountInput.value == 0) {
          this.app.connection.emit('saito-purchase-launch', 0);
        }
      });
    }
  }

  //
  // All communication between browser and service node are off chain, using Relay
  // commands are "bidirectional", i.e. server response uses the same request name
  //
  // *** buysaito available currencies -- request/receive list of acceptable web3 cryptos
  // *** buysaito reserve address -- request/receive a dedicated deposit address for a particular web3 crypto and expected deposit amount
  // *** buysaito release address -- inform server that we don't need the reserved deposit address
  // *** buysaito saito issued -- inform browser of purchase success (on top of also propagating the desired tx)
  //
  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    let txmsg = tx.returnMessage();

    if (!tx.isTo(this.publicKey)) {
      return 0;
    }

    if (txmsg.request.includes('buysaito')) {
      console.debug(txmsg);

      if (txmsg.request == 'buysaito available currencies') {
        if (this.publicKey === this.authorized_public_key && !this.app.BROWSER) {
          if (!this.available_currencies.length) {
            this.loadAvailableCryptos();
          }
          this.app.connection.emit('relay-send-message', {
            recipient: tx.from[0].publicKey,
            request: 'buysaito available currencies',
            data: {
              ac: this.available_currencies,
              erc: this.erc_saito?.price_usd
            }
          });
          this.hasPendingPayment(tx.from[0].publicKey);
        } else if (txmsg.data && this.app.BROWSER) {
          this.available_currencies = txmsg.data.ac;
          if (!this.erc_saito) {
            this.erc_saito = { price_usd: txmsg.data.erc };
          }
          this.app.connection.emit('saito-purchase-cryptos');
        } else {
          console.warn("BUYSAITO - We are getting a request we shouldn't be...");
          console.warn(txmsg);
        }
      }

      if (txmsg.request === 'buysaito report error') {
        this.app.connection.emit('saito-purchase-error-notification');
      }

      if (txmsg.request === 'buysaito reserve address') {
        if (this.publicKey === this.authorized_public_key && !this.app.BROWSER) {
          // If user has an open address, ignore the new specifics... (?)
          if (!this.hasPendingPayment(tx.from[0].publicKey)) {
            if (!tx.isFrom(txmsg.data.initiator_pubkey)) {
              console.error('BUYSAITO - PublicKey mismatch... ignore payment request');
              return;
            }
            await this.checkPrices();
            this.findAvailableAddress(txmsg.data);
          }
        } else if (tx.isFrom(this.authorized_public_key) && this.app.BROWSER) {
          this.pending_payments.push(txmsg.data);
          this.app.connection.emit('saito-purchase-address-reserved', txmsg.data);
        } else {
          console.warn("BUYSAITO - We are getting a request we shouldn't be...");
          console.warn(txmsg);
        }
      }

      if (txmsg.request === 'buysaito release address') {
        if (this.publicKey === this.authorized_public_key && !this.app.BROWSER) {
          for (let i = 0; i < this.pending_payments.length; i++) {
            if (
              this.pending_payments[i].initiator_pubkey == tx.from[0].publicKey &&
              this.pending_payments[i].ticker == txmsg.data.ticker
            ) {
              this.pending_payments[i].status = 'cancelled';
              this.cancelPayment(this.pending_payments[i].id);
            }
          }
        } else {
          console.warn("BUYSAITO - We are getting a request we shouldn't be...");
          console.warn(txmsg);
        }
      }

      if (txmsg.request === 'buysaito saito issued') {
        if (tx.isFrom(this.authorized_public_key) && this.app.BROWSER) {
          for (let j = 0; j < this.pending_payments.length; j++) {
            if (this.pending_payments[j].destination == txmsg.data.destination) {
              this.pending_payments.splice(j, 1);
              this.app.connection.emit('saito-purchase-saito-issued', txmsg.data);
              return;
            }
          }
          console.warn('BUYSAITO - received notification for an Unexpected pending payment');
        } else {
          console.warn('BUYSAITO - Unexpected peer message: ', txmsg);
        }
      }

      return 0;
    }
    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  /**
   * On new block (assuming we get a slip back), roughtly every 30seconds,
   * try to clear out the payments queue
   */
  async onNewBlock(blk, lc) {
    if (this.publicKey == this.authorized_public_key && !this.app.BROWSER) {
      await this.processPendingPayments();
    }
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let buysaito_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      let updatedSocial = Object.assign({}, buysaito_self.social);

      let html = BuySaitoHome(app, buysaito_self, app.build_number, updatedSocial);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }

  //////////////////////////
  /// SERVER FUNCTIONS
  //////////////////////////

  // Use the current Mixin USD-pair rates plus a 5% spread to calculate a given SAITO value
  // in a web3 Crypto. Rounds up to 6th decimal place
  // To-do: round up to 6 significant digit
  //
  convertSaitoToOther(amount, ticker = null) {
    console.log('Currency Conversion: ', amount, ticker);

    let saito_price = this.erc_saito ? 1.05 * Number(this.erc_saito.price_usd) : 1;
    let usd_price = 0;

    if (ticker) {
      for (let cm of this.mixin_mod.crypto_mods) {
        if (cm.ticker == ticker) {
          usd_price = Number(cm.price_usd);
        }
      }
    }

    console.log(saito_price, usd_price);

    if (usd_price == 0) {
      console.warn('BUYSAITO - No ticker selected for conversion!');
    }

    // calculate
    let amount_to_deposit = (amount * saito_price) / usd_price;

    //restrict to 6 significant digits
    amount_to_deposit = Math.ceil(amount_to_deposit * 1000000) / 1000000;

    // Mixin truncates TRX to 6 digits, send 0.32758538, but received amount: '0.327585',

    return amount_to_deposit;
  }

  convertToSaito(amount, ticker = null) {
    let saito_price = this.erc_saito ? 1.05 * Number(this.erc_saito.price_usd) : 1;
    let usd_price = 0;

    if (ticker) {
      if (this.mixin_mod) {
        for (let cm of this.mixin_mod.crypto_mods) {
          if (cm.ticker == ticker) {
            usd_price = Number(cm.price_usd);
          }
        }
      } else {
        for (let cm of this.available_currencies) {
          if (cm.ticker == ticker) {
            usd_price = Number(cm.price_usd);
          }
        }
      }
    }

    if (usd_price == 0) {
      console.warn('BUYSAITO - No ticker selected for conversion!');
    }

    // calculate
    let amount_of_saito = (amount * usd_price) / saito_price;

    return Math.floor(amount_of_saito);
  }

  //
  // Check what mixin-supported web3 cryptos are on the service node
  //
  loadAvailableCryptos() {
    if (!this.mixin_mod) {
      console.error('BUYSAITO - No mixin module -- loadAvailableCryptos');
      return;
    }

    this.available_currencies = [];

    for (let cm of this.mixin_mod.crypto_mods) {
      if (cm.ticker === 'ERC-SAITO') {
        if (!this.erc_saito) {
          this.erc_saito = cm;
          this.erc_saito.activate();
        }
      } else {
        this.available_currencies.push({
          ticker: cm.ticker,
          price_usd: cm.price_usd,
          last_update: cm.last_update,
          icon_url: cm.icon_url
        });
      }
    }
  }

  //
  // Refresh USD-pair price info of Web3Cryptos
  //
  async checkPrices() {
    let updated = false;
    for (let cm of this.mixin_mod.crypto_mods) {
      if (!cm.last_update || Date.now() - cm.last_update > 300000) {
        updated = true;
        await cm.returnNetworkInfo();
      }
    }
    if (updated) {
      this.loadAvailableCryptos();
    }
  }

  /****************************************************************************************************
   * BuySaito uses the built-in Mixin functionality to support a *main* Mixin account, but in order
   * to have multiple valid deposit address, the node needs to juggle multiple mixin account credentials,
   * these are stored in a dedicated database and restored in the initialize() function
   *
   */
  createNewAltAccount(callback) {
    if (!this.mixin_mod) {
      console.error('Mixin not installed!');
      return;
    }

    this.mixin_mod.createAccount(async (res) => {
      if (res.err || Object.keys(res).length < 1) {
        console.error('BUYSAITO - Mixin create account failed...', res.err);
        return;
      }

      // Save encrypted Mixin account (keys) in our own DB...
      let sql = `INSERT INTO mixin_accounts (publickey, mixin_json) VALUES ($publickey, $mixin_json) `;
      let params = {
        $publickey: this.publicKey,
        $mixin_json: res.res
      };

      await this.app.storage.runDatabase(sql, params, 'buysaito');

      // Add raw account keys to our accounts array...
      this.mixin_accounts.push(res.keys);

      // Run provided callback because we don't have a direct return value...
      if (callback) {
        callback(res.keys);
      }
    }, true);
  }

  async loadAltAccounts() {
    let sql = `SELECT * FROM mixin_accounts WHERE publickey = $publickey`;
    let params = { $publickey: this.publicKey };

    let res = await this.app.storage.queryDatabase(sql, params, 'buysaito');

    const privateKey = await this.app.wallet.getPrivateKey();

    for (let r of res) {
      // Unencrypt
      const buf1 = Buffer.from(r.mixin_json, 'base64');
      const buf2 = this.app.crypto.decryptWithPrivateKey(buf1, privateKey);
      this.mixin_accounts.push(JSON.parse(buf2.toString('utf8')));
    }

    console.info(
      `BUYSAITO - Service Loaded ${this.mixin_accounts.length} alternate Mixin accounts`
    );
  }

  returnMixinAccountByID(user_id) {
    if (user_id == this.mixin_mod.mixin.user_id) {
      return this.mixin_mod.mixin;
    }

    for (let j = 0; j < this.mixin_accounts.length; j++) {
      if (this.mixin_accounts[j].user_id == user_id) {
        return this.mixin_accounts[j];
      }
    }

    console.error('Mixin account not found: ', user_id);
    return null;
  }

  //
  // Is this deposit address currently "busy", i.e. associated with a pending payment
  ///
  checkAvailability(ticker, destination) {
    for (let ep of this.pending_payments) {
      if (ep.ticker == ticker && ep.destination == destination) {
        return false;
      }
    }
    console.info(ticker + ':' + destination + ' available!');
    return true;
  }

  //
  //  Find or create a deposit address (Mixin account) that is not currently busy,
  //  then pass that accound and all the user provided data into the function to
  //  create the pending payment
  //
  //  payment_data : { publicKey, issue_amount, ticker, tx}
  //
  async findAvailableAddress(payment_data) {
    //Is my main available?
    const cm = this.app.wallet.returnCryptoModuleByTicker(payment_data.ticker);
    await cm.activate();

    const ticker = payment_data.ticker;
    let destination = cm.address;

    if (this.checkAvailability(ticker, destination)) {
      await this.createPendingPayment(destination, payment_data, this.mixin_mod.mixin);
      return; // exit here
    } else {
      for (let m of this.mixin_accounts) {
        destination = await this.mixin_mod.createDepositAddress(null, cm.chain_id, m);
        if (this.checkAvailability(ticker, destination)) {
          await this.createPendingPayment(destination, payment_data, m);
          return; // exit here
        }
      }
    }

    console.info('BUYSAITO - Creating New Alt Account for Payment Processing...');
    this.createNewAltAccount(async (keys) => {
      // Take the last one
      destination = await this.mixin_mod.createDepositAddress(null, cm.chain_id, keys);
      await this.createPendingPayment(destination, payment_data, keys);
    });
  }

  //
  // Restore DB-backed up pending payments in case server blips offline
  //
  async loadPendingPayments() {
    let sql = `SELECT * FROM purchases WHERE active = 1`;
    let params = {};

    let res = await this.app.storage.queryDatabase(sql, params, 'buysaito');

    let now = Date.now();
    let expired_cutoff = now - this.time_limit;
    for (let i = 0; i < res.length; i++) {
      if (res[i].created_at < expired_cutoff && res[i].status == 'new') {
        this.cancelPayment(res[i].id);
      } else {
        let pp = Object.assign({}, res[i]);
        pp.ts = pp.created_at;

        delete pp.created_at;
        delete pp.updated_at;

        pp.mixin = this.returnMixinAccountByID(pp.mixin_user_id);
        delete pp.mixin_user_id;

        this.pending_payments.push(pp);
      }
    }

    console.debug(
      `BUYSAITO - Recovered ${this.pending_payments.length} pending payments from the DB`
    );
  }

  // Check if a user has a pending payment request
  // (so that we can restore that rather than generate a new one)
  hasPendingPayment(publicKey) {
    this.clearInactivePayments();

    // Check if this user has a pending payment and send them that info again
    for (let p of this.pending_payments) {
      if (p.initiator_pubkey == publicKey && !p.paid) {
        this.app.connection.emit('relay-send-message', {
          recipient: publicKey,
          request: 'buysaito reserve address',
          data: {
            initiator_pubkey: p.initiator_pubkey,
            issue_amount: p.issue_amount,
            ticker: p.ticker,
            destination: p.destination,
            mixin_id: p.mixin.user_id,
            expected_deposit: p.expected_deposit,
            reserved_until: p.ts + this.time_limit,
            status: 'pending'
          }
        });
        return true;
      }
    }
    return false;
  }

  //
  // Clean up array of pending payments to remove expired, cancelled, and completed payments
  //
  clearInactivePayments() {
    // Check for expired addresses
    for (let pp of this.pending_payments) {
      if (pp.status == 'new') {
        if (pp.ts + this.time_limit < Date.now()) {
          console.info('Marking payment as timed out');
          pp.status = 'failed';
          this.cancelPayment(pp.id);
        }
      }
    }

    // Clear from list
    for (let i = this.pending_payments.length - 1; i >= 0; i--) {
      if (
        this.pending_payments[i].status == 'cancelled' ||
        this.pending_payments[i].status == 'failed' ||
        (this.pending_payments[i].status == 'confirmed' && this.pending_payments[i].paid)
      ) {
        this.pending_payments.splice(i, 1);
      }
    }
  }

  //
  // Pending payments are stored in an array and backed up in a database
  //
  async createPendingPayment(destination, payment_data, mixin_account) {
    // Add remaining fields
    payment_data.destination = destination;
    payment_data.ts = Date.now();
    payment_data.status = 'new';
    payment_data.mixin = mixin_account;

    // Do the math
    if (payment_data.issue_amount) {
      payment_data.expected_deposit = this.convertSaitoToOther(
        payment_data.issue_amount,
        payment_data.ticker
      );
    } else if (payment_data.expected_deposit) {
      payment_data.issue_amount = this.convertToSaito(
        payment_data.expected_deposit,
        payment_data.ticker
      );
    } else {
      console.error('BuySaito: no valid numeric input');
    }

    this.pending_payments.push(payment_data);

    //
    // Send key info back to user
    //
    this.app.connection.emit('relay-send-message', {
      recipient: payment_data.initiator_pubkey,
      request: 'buysaito reserve address',
      data: {
        initiator_pubkey: payment_data.initiator_pubkey,
        recipient_pubkey: payment_data.recipient_pubkey,
        issue_amount: payment_data.issue_amount,
        ticker: payment_data.ticker,
        destination: payment_data.destination,
        mixin_id: payment_data.mixin.user_id,
        expected_deposit: payment_data.expected_deposit,
        reserved_until: payment_data.ts + this.time_limit
      }
    });

    // back up to DB
    let sql = `INSERT INTO purchases (initiator_pubkey, recipient_pubkey, ticker, mixin_user_id, destination, issue_amount, expected_deposit, status, tx, created_at) 
    VALUES ($initiator_pubkey, $recipient_pubkey, $ticker, $mixin_user_id, $destination, $issue_amount, $expected_deposit, $status, $tx, $created_at)`;

    let params = {
      $initiator_pubkey: payment_data.initiator_pubkey,
      $recipient_pubkey: payment_data.recipient_pubkey,
      $ticker: payment_data.ticker,
      $mixin_user_id: mixin_account.user_id,
      $destination: payment_data.destination,
      $issue_amount: payment_data.issue_amount,
      $expected_deposit: payment_data.expected_deposit,
      $status: payment_data.status,
      $tx: payment_data.tx,
      $created_at: payment_data.ts
    };

    let res = await this.app.storage.runDatabase(sql, params, 'buysaito');

    console.debug('BUYSAITO - Saved new pending payment: ', res);

    if (res?.lastID) {
      payment_data.id = res.lastID;
    }

    console.debug(this.pending_payments);
  }

  /*************************************************
   * 
   * Pending payments have a number of statuses
   * 
     Statuses: 
        'new'     -- user has requested a deposit address
        'pending'   -- payment is pending in Mixin account, cleared to issue saito
        'confirmed' -- payment in Mixin received (and transfered to safe wallet)
      'failed'    -- payment didn't come in...
        'cancelled' -- timeout or user cancels
   * 
   * The following utility functions update the DB with these statuses
   * 
   *************************************************/

  // We have evidence that mixin is going to get paid, so we mark as pending
  // (which means we can go ahead and release the SAITO)
  async authorizePaymentIssuance(payment_data) {
    console.info('Mark payment as pending...');
    payment_data.status = 'pending';

    let sql = `UPDATE purchases SET status = "pending", updated_at = $updated_at WHERE id=$id`;
    let params = { $id: payment_data.id, $updated_at: Date.now() };
    await this.app.storage.runDatabase(sql, params, 'buysaito');
  }

  async confirmPaymentReceipt(payment_data) {
    payment_data.status = 'confirmed';

    let sql = `UPDATE purchases SET status = "confirmed", external_address = $external_address, updated_at = $updated_at WHERE id=$id`;
    let params = {
      $id: payment_data.id,
      $external_address: payment_data.external_address || '',
      $updated_at: Date.now()
    };
    await this.app.storage.runDatabase(sql, params, 'buysaito');
  }

  // Payment status is set as 'canceled' or 'failed' before calling the function
  async cancelPayment(payment_id) {
    console.log('Canceling payment');
    let sql = `UPDATE purchases SET active = 0, status = "failed", updated_at = $updated_at WHERE id=$id`;
    let params = { $id: payment_id, $updated_at: Date.now() };

    await this.app.storage.runDatabase(sql, params, 'buysaito');
    this.clearInactivePayments();
  }

  async finishPayment(payment_data) {
    let sql = `UPDATE purchases SET active = 0, paid = $paid, updated_at = $updated_at WHERE id=$id`;
    let params = { $id: payment_data.id, $paid: payment_data.paid, $updated_at: Date.now() };

    await this.app.storage.runDatabase(sql, params, 'buysaito');

    this.app.connection.emit('relay-send-message', {
      recipient: payment_data.initiator_pubkey,
      request: 'buysaito saito issued',
      data: payment_data
    });

    console.debug('Payment done: ', payment_data);

    this.app.connection.emit('mailrelay-send-email', {
      to: 'buysaito@saito.tech',
      from: 'Saito Token Sales Bot <info@saito.tech>',
      subject: `On-Chain Saito Issued`,
      text: JSON.stringify(
        payment_data,
        (k, v) => {
          if (k == 'mixin') return undefined;
          else return v;
        },
        3
      ),
      ishtml: false,
      bcc: 'buysaito@saito.io'
    });
  }

  /****************
   *
   * The main function loop that checks all pending payments,
   * the mixin deposit address and decides to issue SAITO
   *
   */
  async processPendingPayments() {
    // First clear out any inactive payments
    this.clearInactivePayments();

    // Second, make sure we have something to process
    if (!this.pending_payments.length) {
      return;
    }

    // Third, check Mixin to update status
    console.debug('BuySaito: Checking pending payments...');
    for (let pp of this.pending_payments) {
      let success = false;
      if (pp.status !== 'confirmed') {
        let { deposits, utxo, snapshots } = await this.mixin_mod.consolidatedLookUp(
          pp.ticker,
          pp.destination,
          pp.ts, // only check transaction history post creating the pending payment
          pp.mixin
        );

        console.debug(pp.ticker, deposits, utxo, snapshots);

        ///////////////////////////
        // If we have a balance on an alternate account, mixin internal transfer to main
        // so the money is all under one set of keys
        try {
          if (pp.mixin.user_id !== this.mixin_mod.mixin.user_id && Number(utxo) > 0) {
            const cm = this.app.wallet.returnCryptoModuleByTicker(pp.ticker);
            res = await this.mixin_mod.sendInNetworkTransferRequest(
              cm.asset_id,
              this.mixin_mod.mixin.user_id,
              utxo,
              pp.mixin
            );
            console.debug('Mixin transfer between accounts: ', res);
          }
        } catch (err) {
          console.error(err);
        }

        // Check pending deposits (first)
        for (let j = 0; j < deposits.length; j++) {
          if (Number(deposits[j].amount) >= pp.expected_deposit) {
            if (deposits[j].status == 'confirmed') {
              // Mark as confirmed
              await this.confirmPaymentReceipt(pp);
              success = true;
            } else if (pp.status == 'new') {
              // Mark as pending
              await this.authorizePaymentIssuance(pp);
              success = true;
            }
          } else {
            console.warn('Unexpected payment to mixin account...');
          }
        }

        // Check if in safe snapshot history
        if (!success) {
          for (let j = 0; j < snapshots.length; j++) {
            if (Number(snapshots[j].amount) >= pp.expected_deposit) {
              // Mark as confirmed
              pp.external_address = snapshots[j].deposit?.sender;
              await this.confirmPaymentReceipt(pp);
            } else {
              console.warn('Unexpected payment to mixin account...');
            }
          }
        }

        if (this.local_dev) {
          if (Math.random() > 0.5) {
            console.debug('Local test mode: upgrading payment status...');
            if (pp.status == 'new') {
              await this.authorizePaymentIssuance(pp);
            } else if (pp.status == 'pending') {
              await this.confirmPaymentReceipt(pp);
            }
          }
        }
      }
    }

    // Fourth, issue payments

    for (let pp of this.pending_payments) {
      let available_balance = await this.app.wallet.getBalance();
      available_balance = await this.app.wallet.convertNolanToSaito(available_balance);

      if (pp.status !== 'new' && !pp.paid) {
        if (available_balance > pp.issue_amount) {
          await this.createSaitoIssuanceTransaction(pp)
            .then((sig) => {
              pp.paid = sig;
              pp.active = 0;
              this.finishPayment(pp);
            })
            .catch((err) => {
              // Don't do anything other than report the error
              console.error(err);

              this.app.connection.emit('mailrelay-send-email', {
                to: 'buysaito@saito.tech',
                from: 'Saito Token Sales Bot <info@saito.tech>',
                subject: `ATTN: Saito Issuance Failure!!`,
                text: err,
                bcc: 'buysaito@saito.io'
              });

              this.app.connection.emit('relay-send-message', {
                recipient: pp.initiator_pubkey,
                request: 'buysaito report error',
                data: null
              });

              // If this is just a matter of the node lacking slips,
              // the pending payment (even one that is confirmed)
              // will remain active and remain in the queue to be issued on the next new block
              // If the server crashes, it will be restored from DB backup and added to the queue
            });
        } else {
          if (!pp.notified) {
            console.error(
              'BuySaito cannot complete sale because lacking money: ',
              available_balance,
              pp.issue_amount
            );

            this.app.connection.emit('mailrelay-send-email', {
              to: 'buysaito@saito.tech',
              from: 'Saito Token Sales Bot <info@saito.tech>',
              subject: `ATTN: Insufficient Funds to Complete Sale -- ` + available_balance,
              text: JSON.stringify(
                pp,
                (k, v) => {
                  if (k == 'mixin') return undefined;
                  else return v;
                },
                3
              ),
              ishtml: false,
              bcc: 'buysaito@saito.io'
            });

            this.app.connection.emit('relay-send-message', {
              recipient: pp.initiator_pubkey,
              request: 'buysaito report error',
              data: null
            });

            pp.notified = true;
          }
        }
      }
    }
  }

  async createSaitoIssuanceTransaction(payment_data) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      payment_data.recipient_pubkey,
      this.app.wallet.convertSaitoToNolan(payment_data.issue_amount)
    );

    if (payment_data.tx) {
      let userTX = new Transaction();
      userTX.deserialize_from_web(this.app, payment_data.tx);
      newtx.msg = userTX.returnMessage();
    } else {
      newtx.msg = {
        module: 'BuySaito',
        request: 'buysaito issuance',
        data: payment_data,
        memo: `${payment_data.expected_deposit} ${payment_data.ticker}`
      };
    }

    console.debug(
      `Issuing ${payment_data.issue_amount} Saito to ${payment_data.recipient_pubkey} with tx_msg: `,
      newtx.msg
    );

    await newtx.sign();
    await this.app.network.propagateTransaction(newtx);

    return newtx.signature;
  }
}

module.exports = BuySaito;
