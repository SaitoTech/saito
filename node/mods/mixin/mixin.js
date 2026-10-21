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
    this.appSession = null;
    this.account_created = 0;
    this.account_creation_promise = null;
    this.crypto_mods = [];
  }

  returnServices() {
    this.services = [];
    if (this.appSession) {
      this.services.push(new PeerService(null, 'mixin'));
    }
    return this.services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
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
    this.transfers = new Transfers(app, this);

    if (!app.BROWSER) {
      this.appSession = this.api.createAppSession();
      await this.database.copyLegacyTables();
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
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    const message = tx.returnMessage();

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

