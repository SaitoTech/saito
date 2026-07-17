/*********************************************************************************

 WEB3 CRYPTO MODULE v.2

 This is a general parent class for modules that wish to define a cryptocurrency 
 that can interact with the Saito ecosystem. It introduces generic functions that 
 should be implemented by these modules to handle web3 cryptos interaction with 
 their external blockchains or networks. 

 To understand how your module can integrate cryptocurrencies, the API is handled
 in lib/saito/wallet.ts

  Minimum extension functionality: 

  -- fetchBalance
  -- returnPrivateKey
  -- sendPayment
  -- receivePayment
  -- checkWithdrawalFeeForAddress
  -- validateAddress

**********************************************************************************/
const ModTemplate = require('./modtemplate');

class CryptoModule extends ModTemplate {
  /**
   * Initialize CryptoModule and check that subclass overrides abstract functions
   * @param {Object} app - Saito Application Context
   * @param {String} ticker - Ticker symbol of underlying Cryptocurrency
   * @example
   * constructor(app, ticker, ...) {
   *   super(app, ticker);
   *   ...
   * }
   */
  constructor(app, ticker) {
    super(app);

    this.app = app;
    this.ticker = ticker;
    this.name = ticker;
    this.categories = 'Cryptocurrency';
    this.description = '';

    //
    // some modules issue warnings to users on selection
    // see ui/saito-crypto/overlays/activate.js
    //
    this.warning = '';
    this.introduction = '';
    this.confirmations = 0;
    this.activated = false;

    //
    // quick sanity check -- cache the balance
    //
    // for Saito and NFT wallets, we can check the balance of the wallet directly by
    // querying Rust, but in other modules, we may have a remote API serving wallet
    // information, in which case we want returnDisplayBalance() to return a cached version
    // and not constantly his the remote API.
    //
    this.balance = '0.0';
    this.pending_deposits = [];
    this.address = '';

    //
    // cached in memory / localForage -- list of standardized objects detailing transaction history
    //
    this.history = [];
    this.history_update_ts = 0;

    //
    // info stored in options file, you can safely add items as necessary
    //
    this.options = {};
    this.options.isActivated = false;

    // There is no guarantee that these persist between page loads
    // Each crypto listens for incoming payments and caches the details in early_payments
    // When a module call receivePayment, it registers an expected payment and checks for it in early_payments
    // Otherwise it starts polling
    // When a registered payment matches an inbound payment, it fires 'on-receive-expected-payment' to clear
    // whatever UI components are connected
    this.transfers_inbound = {};
    this.early_payments = [];

    app.connection.on('on-payment-received', async (p) => {
      if (p.ticker == this.ticker) {
        // Force a balance check for smoothly rerendering... (i think)
        this.balance = await this.getAvailableBalance();
        console.log('*************** payment-received ***********', p);
        this.processExpectedPayment(p);
      }
    });

    app.connection.on('on-payment-sent', async (p) => {
      if (p.ticker == this.ticker) {
        this.balance = await this.getAvailableBalance();
        console.log('*************** payment-sent ***********', p);
      }
    });
  }

  // These are overwritten by the individual crypto modules
  // we should define these as mandatory functions and throw an
  // error if a module is inheriting without defining.
  async getAvailableBalance() {
    return this.balance;
  }

  async getPendingBalance() {
    return this.balance;
  }

  async fetchPendingDeposits() {
    return [];
  }

  startPolling() {}

  stopPolling() {}

  /**
   * Saito Module initialize function
   * @param {*} app
   */
  async initialize(app) {
    await super.initialize(app);

    //
    // We save the state of our crypto wallet local storage (options file)
    //
    this.load();

    if (this.ticker === this.app.wallet.returnPreferredCryptoTicker()) {
      await this.activate();
    }
  }

  ///////////////////////////////////////////////
  // Accept payments even from blacklisted people
  ///////////////////////////////////////////////
  respondTo(type = '', obj) {
    if (type === 'saito-moderation-app') {
      return {
        filter_func: (mod = null, tx = null) => {
          if (tx == null || mod == null || !tx?.from) {
            return 0;
          }

          //This function is called with every module for some reasons
          if (mod.name !== this.name) {
            return 0;
          }

          return 1;
        }
      };
    }
  }

  async onConfirmation(blk, tx, conf) {
    if (Number(conf) == 0) {
      if (!tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
        return 0;
      }

      await tx.decryptMessage(this.app);
      let txmsg = tx.returnMessage();

      if (txmsg.module !== this.name) {
        return 0;
      }

      if (this.hasSeenTransaction(tx, blk)) {
        console.error('We are double processing a payment transaction!!!!');
        return 1;
      }

      if (txmsg.request === 'crypto payment') {
        let direction = '';
        if (tx.isFrom(this.publicKey) && (!tx.isTo(this.publicKey) || tx.to.length > 1)) {
          direction = 'send';
        } else if (tx.isTo(this.publicKey)) {
          direction = 'receive';
        } else {
          direction = 'unknown';
        }

        let sender = tx.from[0].publicKey;
        let amount = Number(txmsg.amount);

        console.log('***** crypto payment announcement *****', txmsg);

        this.startPolling();

        if (this.app.BROWSER) {
          if (direction == 'receive') {
            siteMessage(
              `Anticipating ${amount} ${this.ticker} from ${this.app.keychain.returnUsername(sender)}`,
              3000
            );
          }
        }

        return 1;
      }
    }

    return 0;
  }

  async sendPaymentTransaction(publicKey, from_address, to_address, amount, hash, memo = '') {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(publicKey);

    let fix_amount = Number(amount).toString();

    newtx.msg = {
      module: this.name,
      request: 'crypto payment',
      amount: fix_amount,
      from: from_address,
      to: to_address,
      hash
    };

    if (memo) {
      newtx.msg.memo = memo;
    }

    await newtx.sign();
    await this.app.network.propagateTransaction(newtx);

    console.log(
      `******** Crypto: sendPaymentTransaction *********\n sent to ${publicKey}!`,
      newtx.msg
    );
  }

  returnLogos() {
    return (
      this.app.modules.getRespondTos('crypto-logo', { ticker: this.ticker }).shift() || {
        img: this.icon_url || `/${this.ticker.toLowerCase()}/img/logo.png`
      }
    );
  }

  /**
   * @return true/false as to whether the crypto module is installed/activated (e.g. has a valid address)
   */
  isActivated() {
    //
    // modules might want to know which cryptos are activated before the
    // crypto modules themselves have initialize(app), in which case we
    // have a fallback.
    //
    if (this.app.options?.crypto) {
      if (this.app.options.crypto[this.ticker]) {
        if (this.app.options.crypto[this.ticker].isActivated) {
          return true;
        }
      }
    }

    return this.options.isActivated;
  }

  /**
   * isActivated is an optional flag that allows users to enable a crypto module.
   * This is needed to accomodate UX in the case that a particular module might
   * require significant resources.
   */
  async activate() {
    if (!this.activated) {
      console.log('Initializing/Activating ' + this.ticker);

      this.activated = true;
      await this.fetchBalance();
      this.options.isActivated = true;
      //async but not awaiting...
      this.loadHistory();
      this.save();
    }
    this.app.connection.emit('saito-crypto-activated', this.ticker);
  }

  /**
   *  This function exists only to create a potential stop point in receivePayment
   *  Instead of refactoring it into oblivion, the code is interesting and may be a good
   *  reference for connecting an event listener to receivePayment in leiu of repeated polling
   */
  onIsActivated() {
    return new Promise((resolve, reject) => {
      if (this.isActivated()) {
        resolve();
      } else {
        this.app.connection.on('saito-crypto-activated', (ticker) => {
          if (ticker === this.ticker) {
            resolve();
          }
        });

        this.activate();
      }
    });
  }

  /**
   * Synchronous getter for UI display. Prefers pending_balance when set (e.g. Mixin
   * post-send optimistic override); otherwise returns the persisted confirmed balance.
   * @return {String} display balance, not necessarily the latest API-confirmed value
   */
  returnDisplayBalance() {
    return this.pending_balance || this.balance || '0';
  }

  /**
   * Abstract method which should get pubkey/address
   * @abstract
   * @return {String} Pubkey/address
   */
  returnAddress() {
    try {
      return this.address;
    } catch (error) {
      console.error('Crytpo: [returnAddress] ERROR:', error);
    }
  }

  formatAddress() {
    return this.returnAddress();
  }

  /**
   * load state of this module from local storage
   */
  load() {
    //
    // info stored in options file
    //
    if (this.app?.options?.crypto) {
      if (this.app.options.crypto[this.ticker]) {
        this.options = this.app.options.crypto[this.ticker];

        // For convenience we put balance and address at the top level of the module
        if (this.options?.balance && Number(this.balance) == 0) {
          this.balance = this.options.balance;
        }

        if (this.options?.address && !this?.address) {
          this.address = this.options.address;
        }

        if (this.options.confirmations) {
          this.confirmations = this.options.confirmations;
        }
      }
    }
  }

  async loadHistory() {
    if (this.address) {
      const history = await this.app.storage.getLocalForageItem(
        `${this.ticker}_${this.address}_history`
      );
      if (history) {
        this.history = JSON.parse(history);
        await this.validateHistory();
        if (this.history?.length > 0) {
          this.history_update_ts = this.history[this.history.length - 1].timestamp;
          console.info(
            `Crypto (${this.ticker}) History up to ${new Date(this.history_update_ts)}!`,
            this.history
          );

          this.save();
        }
      } else {
        this.history = [];
        this.history_update_ts = 0;
      }
    }
  }

  async validateHistory() {
    for (let i = 0; i < this.history.length; i++) {
      for (let j = i + 1; j < this.history.length; j++) {
        //
        // removes duplicate values...
        //
        if (
          this.history[i].timestamp === this.history[j].timestamp &&
          this.history[i].amount == this.history[j].amount
        ) {
          console.warn(`Resetting ${this.ticker} transaction history cache...`);
          await this.app.storage.removeLocalForageItem(`${this.ticker}_${this.address}_history`);
          this.history = [];
          this.history_update_ts = 0;
        }
      }
    }
  }

  /**
   *
   * Registers an expected payment and checks for it...
   * Searches for a payment which matches the criteria specified in the parameters.
   * @abstract
   * @param {Number} howMuch - How much of the token was transferred
   * @param {String} from - Pubkey/address the transasction was sent from
   * @param {timestamp} to - timestamp after which the transaction was sent
   * @return {Boolean}
   */
  async receivePayment(amount, sender, unique_hash = '') {
    // Check if we already received it

    if (this.early_payments.length) {
      for (let i = 0; i < this.early_payments.length; i++) {
        let early_sender = this.early_payments[i].sender_address || this.early_payments[i].sender;
        if (early_sender == sender) {
          if (Number(this.early_payments[i].amount) == Number(amount)) {
            this.app.connection.emit(
              'on-receive-expected-payment',
              unique_hash,
              this.early_payments[i]
            );
            this.early_payments.splice(i, 1);
            return;
          }
        }
      }
    }

    this.transfers_inbound[unique_hash] = { sender, amount };

    // Start monitoring for incoming payment
    await this.startPolling();
  }

  /**********************
     payment payload (obj):
     **********************
     ticker: (string)
     amount: (string) 
     receiver: (string) saito public key (if known)
     receiver_address: (string) chain address (if applicable)
     sender: (string) saito public key (if known)
     sender_address: (string) chain address (if applicable)
     timestamp: (int)

     // extra stuff from wasm event
     block_hash,
     block_id,
     signature,
     transaction_type,

     // extra stuff from Mixin
     transaction_signature <- "snap.transaction_hash"
     memo: (string)
   */
  processExpectedPayment(obj = {}) {
    let receiver = obj.receiver_address || obj.receiver;
    if (receiver !== this.publicKey && receiver !== this.formatAddress()) {
      console.warn('***** Payment not to me!', obj);
      return;
    }

    // Try chain address, fallback to SAITO publickey
    let sender = obj.sender_address || obj.sender;

    for (let h in this.transfers_inbound) {
      if (this.transfers_inbound[h].sender == sender) {
        // Convert to Number so we don't worry about string formatting
        if (Number(this.transfers_inbound[h].amount) == Number(obj.amount)) {
          this.app.connection.emit('on-receive-expected-payment', h, obj);
          delete this.transfers_inbound[h];
          return;
        } else {
          console.warn(
            ' *** Received a payment of an unexpected amount ***',
            this.transfers_inbound[h],
            obj
          );
          // Under/overpaid condition...
        }
      }
    }

    // cache the payment if it doesn't match the inbound transfers
    obj.timestamp = Date.now();
    this.early_payments.push(obj);
    return false;
  }

  /**
   * save state of this module to local storage
   */
  save() {
    if (!this.app?.options?.crypto) {
      this.app.options.crypto = {};
    }
    if (!this.app.options.crypto[this.ticker]) {
      this.app.options.crypto[this.ticker] = {};
    }

    this.options.confirmations = this.confirmations;

    //
    // Update the fields that we duplicte directly in the module
    //
    this.options.balance = this.balance;
    this.options.address = this.address;

    // Clean up legacy storage
    delete this.options.destination;

    this.app.options.crypto[this.ticker] = this.options;

    this.app.storage.saveOptions();

    if (this.history?.length) {
      this.app.storage.setLocalForageItem(
        `${this.ticker}_${this.address}_history`,
        JSON.stringify(this.history)
      );
    }
  }

  async returnAddressFromPublicKey(publicKey) {
    if (this.validateAddress(publicKey)) {
      return publicKey;
    }

    if (!this.app.crypto.isPublicKey(publicKey)) {
      throw new Error(`Error 237509: ${publicKey} is not a Saito public key`);
    }

    let key = this.app.keychain.returnKey(publicKey, true);

    if (key?.crypto_addresses) {
      return key.crypto_addresses[this.ticker];
    }

    return null;
  }

  getSaitoPublicKey(address) {
    if (this.app.crypto.isPublicKey(address)) {
      return address;
    }

    return '';
  }

  /**
   * return utxo
   * @abstract
   * @param {string} address to validate
   * @param {string} ticker to for selected crypto
   * @return {boolean} true/false
   */
  async returnUtxo(state = 'unspent', limit = 1000, order = 'DESC') {
    return true;
  }
}

/**
 * Hit the API point for the latest account balance
 * (and cache it as this.balance)
 *
 * @return {string} the latest balance
 *
 */
CryptoModule.prototype.fetchBalance = async function () {
  throw new Error('fetchBalance must be implemented by subclass!');
};

/**
 * Abstract method which should get private key
 * @abstract
 * @return {String} Private Key
 */
CryptoModule.prototype.returnPrivateKey = function () {
  throw new Error('returnPrivateKey must be implemented by subclass!');
};

/**
 * Abstract method which should transfer tokens via the crypto endpoint
 * @abstract
 * @param {Number} howMuch - How much of the token to transfer
 * @param {String} to - Pubkey/address to send to
 * @param {String} uniqueHash - to make sure the code doesn't trigger this twice on browser refresh
 * @return {Number}
 */
CryptoModule.prototype.sendPayment = async function (
  amount = '',
  recipient = '',
  unique_hash = ''
) {
  throw new Error('sendPayment must be implemented by subclass!');
};

CryptoModule.prototype.checkWithdrawalFeeForAddress = function (recipient = '', mycallback = null) {
  if (mycallback != null) {
    mycallback(0);
  }
};

/**
 * Validate given address
 * @abstract
 * @param {string} address to validate
 * @param {string} ticker to for selected crypto
 * @return {boolean} true/false
 */
CryptoModule.prototype.validateAddress = function (address) {
  return true;
};

module.exports = CryptoModule;
