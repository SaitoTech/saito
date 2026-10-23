const MixinModule = require('./lib/mixinmodule');
const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const Database = require('./lib/database');
const Api = require('./lib/api');
const { formatMixinError } = Api;
const Accounts = require('./lib/accounts');
const Transfers = require('./lib/transfers');
class Mixin extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Mixin';
    this.slug = 'mixin';
    this.appname = 'Mixin';
    this.description = 'Adding support for Web3 Crypto transfers on Saito';
    this.categories = 'Finance Utilities';
    this.icon = 'fas fa-wallet';
    this.class = 'utility';
    this.status = 'prod';

    this.MixinModule = MixinModule;
    this.credentials = {};
    this.mixin_peer = null;
    this.buysaito_peer = null;
    this.available_currencies = [];
    this.erc_saito = null;
    this.pending_payments = [];
    this.purchase_overlay = null;
    this.main = null;
    this.styles = ['/mixin/style.css'];
    this.appSession = null;
    this.account_created = 0;
    this.account_creation_promise = null;
    this.crypto_mods = [];
    this.transfers = null;
    this.transfer_timer = null;
  }

  returnServices() {
    this.services = [];
    if (this.appSession) {
      this.services.push(new PeerService(null, 'mixin'));
      if (this.fulfillsBuySaitoLocally()) {
        this.services.push(new PeerService(null, 'buysaito'));
      }
    }
    return this.services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'buysaito' && this.app.BROWSER) {
      this.buysaito_peer = peer;
      this.app.network.sendRequestAsTransaction(
        'buysaito available currencies',
        null,
        null,
        peer.publicKey
      );
    }

    if (service.service === 'mixin') {
      console.info('Mixin Module: API online!');
      this.mixin_peer = peer;

      if (this.credentials?.user_id && !this.credentials.backed_up) {
        console.info('Need to back up my mixin');
        const accountHash = this.accounts.encryptCredentials(this.credentials, this.publicKey);
        this.app.network.sendRequestAsTransaction(
          'mixin account backup',
          { account_hash: accountHash },
          () => {
            this.credentials.backed_up = true;
            this.accounts.saveCredentials(this.credentials);
          },
          peer.publicKey
        );
      }
    }
  }

  async initialize(app) {
    await super.initialize(app);

    this.database = new Database(app, this);
    this.api = new Api();
    this.accounts = new Accounts(app, this);

    if (!app.BROWSER) {
      this.appSession = this.api.createAppSession();
      await this.database.ensureAccountsSchema();
      await this.database.ensureTransfersSchema();
      await this.database.copyLegacyTables();
      this.transfers = new Transfers(app, this);
    }

    const stored = this.accounts.getCredentials();
    if (stored?.user_id && this.accounts.areCredentialsDeprecated(stored)) {
      app.options.mixin_legacy = stored;
      this.credentials = {};
      this.account_created = 0;
      this.accounts.saveCredentials({});
      await app.wallet.setPreferredCrypto('SAITO', 1);
    } else if (stored?.user_id) {
      this.credentials = stored;
      this.account_created = 1;
    } else {
      this.credentials = {};
    }

    this.installCryptos();

    if (app.BROWSER) {
      const SaitoPurchaseOverlay = require('./lib/ui/overlays/buysaito-purchase');
      const Main = require('./lib/ui/main');
      this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
      this.main = new Main(app, this);
    }

    if (!app.BROWSER && this.appSession && this.transfers && this.fulfillsBuySaitoLocally()) {
      this.transfers.processTransferQueue().catch((err) => {
        console.error('Mixin transfer queue failed:', err);
      });
      this.transfer_timer = setInterval(() => {
        this.transfers.processTransferQueue().catch((err) => {
          console.error('Mixin transfer queue failed:', err);
        });
      }, 10000);
      this.transfer_timer.unref?.();
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    const message = tx.returnMessage();

    if (
      this.app.BROWSER &&
      tx.isTo(this.publicKey) &&
      typeof message.request === 'string' &&
      message.request.startsWith('buysaito ')
    ) {
      return this.receiveBuySaitoReply(tx, message);
    }

    //
    // lite-client wants to create an account
    //
    if (message.request === 'mixin create account') {
      try {
        const created = await this.accounts.createAccount(tx.from[0].publicKey);
        if (mycallback) {
          mycallback({ res: created.ciphertext, restored: created.restored });
        }
      } catch (err) {
        console.error('Mixin Create Account Error', err);
        if (mycallback) {
          mycallback({ err: formatMixinError(err) || 'Mixin create account error' });
        }
      }
      return 1;
    }

    //
    // lite-client wants to create new web3 crypto address
    //
    if (message.request === 'mixin save new deposit address') {
      const data = message.data || {};
      await this.database.insertAddress({
        mixinUserId: data.user_id,
        publicKey: data.publickey,
        assetId: data.asset_id,
        address: data.address,
        createdAt: tx.timestamp
      });
      if (mycallback) {
        mycallback(true);
      }
      return 1;
    }

    //
    // asking for payment info for another user
    //
    if (message.request === 'mixin fetch user') {
      const data = message.data || {};
      if (!data.asset_id || (!data.address && !data.publicKey && !data.user_id)) {
        if (mycallback) {
          mycallback([]);
        }
        return 1;
      }

      try {
        const row = await this.database.findAddress({
          assetId: data.asset_id,
          mixinUserId: data.user_id,
          publicKey: data.publicKey,
          address: data.address
        });
        if (mycallback) {
          mycallback(row ? [row] : []);
        }
      } catch (err) {
        console.error(err);
        if (mycallback) {
          mycallback([]);
        }
      }
      return 1;
    }

    if (
      !this.app.BROWSER &&
      this.appSession &&
      this.transfers &&
      tx.isTo(this.publicKey) &&
      this.fulfillsBuySaitoLocally() &&
      typeof message.request === 'string' &&
      message.request.startsWith('buysaito ')
    ) {
      const from = tx.from?.[0]?.publicKey;
      // A relayed purchase is delivered by the relay peer, not by the buyer.
      if (!from || peer?.publicKey !== from) {
        return 0;
      }
      const data = message.data || {};

      if (message.request === 'buysaito available currencies') {
        const currencies = [];
        let erc = null;
        for (const crypto of this.crypto_mods) {
          if (!crypto.last_update || Date.now() - crypto.last_update > 300000) {
            await crypto.returnMixinNetworkInfo();
          }
          if (crypto.ticker === 'ERC-SAITO') {
            erc = crypto;
          } else if (crypto.ticker && crypto.ticker !== 'BEP-SAITO') {
            currencies.push({
              ticker: crypto.ticker,
              chain_id: crypto.chain_id,
              price_usd: crypto.price_usd,
              last_update: crypto.last_update,
              icon_url: crypto.icon_url
            });
          }
        }
        const response = { ac: currencies, erc: erc?.price_usd };
        this.app.network.sendRequestAsTransaction(
          'buysaito available currencies',
          response,
          null,
          from
        );
        if (mycallback) {
          mycallback(response);
        }
        return 1;
      }

      if (message.request === 'buysaito reserve address') {
        if (!from || from !== (data.initiator_publickey || data.initiator_pubkey)) {
          const response = {
            message:
              'The payment service could not generate a deposit address. Please try again shortly.'
          };
          this.app.network.sendRequestAsTransaction('buysaito report error', response, null, from);
          if (mycallback) {
            mycallback(response);
          }
          return 1;
        }
        try {
          const instructions = await this.transfers.reserveAddress(from, data);
          this.app.network.sendRequestAsTransaction(
            'buysaito reserve address',
            instructions,
            null,
            from
          );
          if (mycallback) {
            mycallback(instructions);
          }
        } catch (err) {
          console.error('BuySaito reservation failed:', err);
          const response = {
            message:
              'The payment service could not generate a deposit address. Please try again shortly.'
          };
          this.app.network.sendRequestAsTransaction('buysaito report error', response, null, from);
          if (mycallback) {
            mycallback({ err: err.message });
          }
        }
        return 1;
      }

      if (message.request === 'buysaito release address') {
        if (from && data.ticker) {
          await this.transfers.releaseAddress(from, data.ticker);
        }
        if (mycallback) {
          mycallback(true);
        }
        return 1;
      }
    }

    //
    // requesting storage of encrypted account information
    //
    if (message.request === 'mixin account backup') {
      await this.database.saveCredentials(peer.publicKey, message.data.account_hash);
      if (mycallback) {
        mycallback();
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  respondTo(type = '', obj) {
    if (type == 'crypto-logo') {
      const ticker = obj.ticker;
      for (const cryptoModule of this.crypto_mods) {
        if (ticker == cryptoModule.ticker) {
          if (cryptoModule.respondTo('crypto-logo', obj)) {
            return cryptoModule.respondTo('crypto-logo', obj);
          }

          const logo = {};
          if (cryptoModule.icon_url) {
            logo.img = cryptoModule.icon_url;
            logo.alt_img = `/${ticker.toLowerCase()}/img/logo.png`;
          } else {
            logo.img = `/${ticker.toLowerCase()}/img/logo.png`;
          }

          if (cryptoModule.chain_id !== cryptoModule.asset_id) {
            for (let i = 0; i < this.crypto_mods.length; i++) {
              if (this.crypto_mods[i].asset_id == cryptoModule.chain_id) {
                logo.sub_logo = `/${this.crypto_mods[i].ticker.toLowerCase()}/img/logo.png`;
              }
            }
          }

          return logo;
        }
      }
    }

    return null;
  }

  installCryptos() {
    const mixinSelf = this;
    const modules = this.app.modules.respondTo('mixin-crypto');

    for (let i = 0; i < modules.length; i++) {
      const cryptoModule = new MixinModule(
        this.app,
        mixinSelf,
        modules[i].ticker,
        modules[i].asset_id,
        modules[i].chain_id
      );

      if (modules[i].returnBalance) {
        cryptoModule.returnBalance = modules[i].returnBalance;
      }

      if (this.app.BROWSER) {
        if (!this.app.browser.returnURLParameter('withdraw')) {
          if (modules[i].name !== modules[i].ticker) {
            console.warn('Installing a ghost crypto module: ', modules[i].name, modules[i].ticker);
            cryptoModule.hide_me = true;
          }
        }
      }

      this.crypto_mods.push(cryptoModule);
      this.app.modules.mods.push(cryptoModule);

      setTimeout(async () => {
        if (typeof cryptoModule?.returnMixinNetworkInfo === 'function') {
          await cryptoModule.returnMixinNetworkInfo();
        }

        await cryptoModule.installModule(mixinSelf.app);

        if (mixinSelf.account_created) {
          if (cryptoModule.isActivated() || cryptoModule.address) {
            await cryptoModule.activate();
          }
        }
      }, 250);
    }
  }

  fetchCredentials() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(res);
        }
      };
      const timeout = setTimeout(() => finish({ err: 'Mixin account service timed out' }), 30000);

      try {
        Promise.resolve(
          this.app.network.sendRequestAsTransaction(
            'mixin create account',
            {},
            finish,
            this.mixin_peer?.publicKey
          )
        ).catch((err) => finish({ err: formatMixinError(err) }));
      } catch (err) {
        finish({ err: formatMixinError(err) });
      }
    });
  }

  async createAccount() {
    if (this.account_created && this.credentials?.user_id) {
      console.warn('You already have a Mixin Account created...');
      return { keys: this.credentials, existing: true };
    }

    if (this.account_creation_promise) {
      return this.account_creation_promise;
    }

    this.account_creation_promise = (async () => {
      const privateKey = await this.app.wallet.getPrivateKey();
      let response;

      if (this.mixin_peer) {
        console.log('Request remote node to create Mixin User Account', this.mixin_peer.publicKey);
        response = await this.fetchCredentials();
      } else if (this.app.BROWSER) {
        response = { err: 'Mixin account service is unavailable' };
      } else {
        console.log('==> Create Mixin User Account on Same Node as API Keys');
        try {
          const created = await this.accounts.createAccount(this.publicKey);
          response = { res: created.ciphertext, restored: created.restored };
        } catch (err) {
          response = { err: formatMixinError(err) };
        }
      }

      if (typeof response !== 'object' || !response?.res) {
        const error = response?.err || 'Mixin account service returned no account';
        console.error('Mixin Account Error:', error);
        return { err: error };
      }

      try {
        const keys = this.accounts.decryptCredentials(response.res, privateKey);
        if (response.restored) {
          console.log('Successfully Restored Mixin Account!');
        } else {
          console.log('Successfully Created Mixin Account!');
        }
        this.credentials = keys;
        this.account_created = 1;
        this.accounts.saveCredentials(keys);
        return { keys, restored: !!response.restored };
      } catch (err) {
        const error = `Unable to decrypt Mixin account: ${formatMixinError(err)}`;
        console.error(error);
        return { err: error };
      }
    })();

    try {
      return await this.account_creation_promise;
    } finally {
      this.account_creation_promise = null;
    }
  }

  render() {
    if (this.browser_active && this.main) {
      this.main.render();
    }
  }

  webServer(app, expressapp, express) {
    const MainTemplate = require('./lib/ui/main.template');
    const webdir = `${__dirname}/web`;
    const sendPage = (res) => {
      const card = this.social || {
        twitter: '',
        title: 'Buy SAITO',
        url: '/mixin',
        description: this.description,
        image: ''
      };
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(MainTemplate(app, this, app.build_number, card));
    };

    expressapp.get('/' + encodeURI(this.returnSlug()), (req, res) => {
      sendPage(res);
    });

    // The old purchase page lived at /buy. Keep that entry point when BuySaito
    // is not installed to register it itself.
    if (!app.modules?.returnModule?.('BuySaito')) {
      expressapp.get('/buy', (req, res) => {
        sendPage(res);
      });
    }

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }

  receiveBuySaitoReply(tx, message) {
    const peerKey = this.buysaito_peer?.publicKey;
    if (!peerKey || !tx.isFrom(peerKey)) {
      return 0;
    }

    const data = message.data;

    if (message.request === 'buysaito available currencies') {
      const excluded = new Set(['ERC-SAITO', 'BEP-SAITO']);
      this.available_currencies = Array.isArray(data?.ac)
        ? data.ac.filter((currency) => currency?.ticker && !excluded.has(currency.ticker))
        : null;
      if (!this.erc_saito) {
        this.erc_saito = { price_usd: data?.erc };
      }
      if (this.browser_active) {
        this.purchase_overlay?.renderAmountPage();
      }
      this.app.connection.emit('saito-purchase-cryptos');
      return 1;
    }

    if (message.request === 'buysaito report error') {
      this.app.connection.emit('saito-purchase-error-notification', data || {});
      return 1;
    }

    if (message.request === 'buysaito reserve address') {
      this.pending_payments.push(data);
      this.app.connection.emit('saito-purchase-address-reserved', data);
      return 1;
    }

    if (message.request === 'buysaito payment detected') {
      const payment = this.pending_payments.find(
        (row) => row.id === data?.id && row.address === data?.address && row.ticker === data?.ticker
      );
      if (payment && ['pending', 'confirmed'].includes(data.status)) {
        payment.status = data.status;
        this.app.connection.emit('saito-purchase-payment-detected', data);
      }
      return 1;
    }

    if (message.request === 'buysaito saito issued') {
      const index = this.pending_payments.findIndex((row) => row.address === data?.address);
      if (index >= 0) {
        this.pending_payments.splice(index, 1);
        this.app.connection.emit('saito-purchase-saito-issued', data);
      }
      return 1;
    }

    return 0;
  }

  convertSaitoToOther(amount, ticker = null) {
    let saito_price = this.erc_saito ? 1.1 * Number(this.erc_saito.price_usd) : 1;
    saito_price = Math.max(0.001, saito_price);

    let usd_price = 0;
    if (ticker) {
      const currencies = this.crypto_mods?.length ? this.crypto_mods : this.available_currencies || [];
      for (const currency of currencies) {
        if (currency.ticker == ticker) {
          usd_price = Number(currency.price_usd);
        }
      }
    }

    if (usd_price == 0) {
      console.warn('Mixin - No ticker selected for conversion!');
    }

    return Math.ceil(((amount * saito_price) / usd_price) * 1000000) / 1000000;
  }

  convertToSaito(amount, ticker = null) {
    let saito_price = this.erc_saito ? 1.1 * Number(this.erc_saito.price_usd) : 1;
    saito_price = Math.max(0.001, saito_price);

    let usd_price = 0;
    if (ticker) {
      const currencies = this.crypto_mods?.length ? this.crypto_mods : this.available_currencies || [];
      for (const currency of currencies) {
        if (currency.ticker == ticker) {
          usd_price = Number(currency.price_usd);
        }
      }
    }

    if (usd_price == 0) {
      console.warn('Mixin - No ticker selected for conversion!');
    }

    return Math.floor((amount * usd_price) / saito_price);
  }

  fulfillsBuySaitoLocally() {
    const buysaito = this.app.modules?.returnModule?.('BuySaito');
    return !buysaito || buysaito.publicKey === buysaito.authorized_public_key;
  }

  async onNewBlock(block, longestChain) {
    if (!this.app.BROWSER && this.transfers && this.fulfillsBuySaitoLocally()) {
      await this.transfers.onNewBlock(block, longestChain);
    }
  }

  async onChainReorganization(blockId, blockHash, longestChain) {
    if (!this.app.BROWSER && this.transfers && this.fulfillsBuySaitoLocally()) {
      await this.transfers.onChainReorganization(blockId, blockHash, longestChain);
    }
  }

  destroy(app) {
    clearInterval(this.transfer_timer);
    this.transfer_timer = null;
    super.destroy(app);
  }

  fetchMixinUser(query) {
    if (this.app.BROWSER) {
      return new Promise((resolve) => {
        this.app.network.sendRequestAsTransaction(
          'mixin fetch user',
          query,
          (res) => {
            resolve(Array.isArray(res) && res.length ? res[0] : null);
          },
          this.mixin_peer?.publicKey
        );
      });
    }

    return this.database.findAddress({
      assetId: query.asset_id,
      mixinUserId: query.user_id,
      publicKey: query.publicKey,
      address: query.address
    });
  }
}

module.exports = Mixin;

