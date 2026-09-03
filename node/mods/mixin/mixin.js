const saito = require('./../../lib/saito/saito');
const MixinModule = require('./lib/mixinmodule');
const ModTemplate = require('../../lib/templates/modtemplate');
const fetch = require('node-fetch');
const axios = require('axios');
const Decimal = require('decimal.js');
const JSON = require('json-bigint');
const PeerService = require('saito-js/lib/peer_service').default;
const {
  MixinApi,
  getED25519KeyPair,
  signEd25519PIN,
  base64RawURLEncode,
  base64RawURLDecode,
  getTipPinUpdateMsg,
  MixinCashier,
  buildSafeTransactionRecipient,
  getUnspentOutputsForRecipients,
  buildSafeTransaction,
  encodeSafeTransaction,
  signSafeTransaction,
  blake3Hash
} = require('@mixin.dev/mixin-node-sdk');
const { v4 } = require('uuid');

function createMixinCredentials(account = {}) {
  const keystore = {
    app_id: account.user_id,
    session_id: account.session_id,
    pin_token_base64: account.tip_key_base64 || account.pin_token_base64,
    session_private_key: account.session_seed || account.session_private_key
  };
  const spend_private_key = account.spend_private_key;

  const missing = [];
  for (const [name, value] of Object.entries({ ...keystore, spend_private_key })) {
    if (!value) {
      missing.push(name);
    }
  }

  if (missing.length) {
    throw new Error(`Mixin account configuration is incomplete (missing: ${missing.join(', ')})`);
  }

  return {
    keystore,
    spend_private_key,
    user_id: keystore.app_id
  };
}

function createMixinMemo(memo = '') {
  if (Buffer.isBuffer(memo)) {
    return memo;
  }
  return Buffer.from(String(memo), 'utf8');
}

function calculatePendingBalance(balance, ...deductions) {
  let pending = new Decimal(balance);
  for (const deduction of deductions) {
    pending = pending.minus(deduction);
  }
  return Number(pending.toFixed(8));
}

function selectWithdrawalFee(feeResponse, assetId, chainAssetId) {
  const fees = Array.isArray(feeResponse) ? feeResponse : feeResponse ? [feeResponse] : [];
  const assetFee = fees.find((fee) => fee.asset_id === assetId);
  const chainFee = fees.find((fee) => fee.asset_id === chainAssetId);

  return assetFee ?? chainFee ?? (fees.length === 1 ? fees[0] : null);
}

function formatMixinError(err) {
  const apiError = err?.response?.data?.error;
  if (apiError?.description || apiError?.code) {
    return [apiError.code, apiError.description].filter(Boolean).join(': ');
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    const serialized = JSON.stringify(err);
    return serialized === undefined ? String(err) : serialized;
  } catch (jsonError) {
    return String(err);
  }
}

//
// Mixin Module
//
// Mixin is an infrastructure / API provider for multiple cryptocurrency wallets. Thie Saito
// modules provides integration with their backend API to various Saito modules, permitting
// users to store and use Mixin-held cryptocurrencies on the network as with other crypto-
// modules like DOT.
//
// In addition to integrating with the Saito Wallet. This module also offers functionality
// that allows Saito nodes to collect payment in non-SAITO cryptocurrencies, by supporting
// their ability to automatically collect non-SAITO cryptos and exchange them for SAITO in
// real-time. This powers the "buy with other crypto" functionality in the Saito Store and
// in the "buysaito" app.
//
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

    //
    // reference for dynamic modules
    //
    this.MixinModule = MixinModule;

    //
    // wallets will contain
    //
    this.mixin = {};
    // this.mixin.user_id = '';
    // this.mixin.session_id = '';
    // this.mixin.session_seed = '';
    // this.mixin.full_name = '';
    // this.mixin.tip_key_base64 = '';
    // this.mixin.spend_private_key = '';
    // this.mixin.spend_public_key = '';

    this.mixin_peer = null;
    this.bot = null;
    this.account_created = 0;
    this.account_creation_promise = null;
    this.crypto_mods = [];
  }

  //
  // returnServices
  //
  // Mixin service allows nodes and browsers which connect to this device to create
  // wallets using the Mixin API key of this node. This service is necessary since
  // requests for account creation must be linked to an existing API-key, and fee-free
  // transfers within Saito are possible between wallets that were created with the
  // same API-key.
  //
  returnServices() {
    this.services = [];
    if (this.bot) {
      this.services.push(new PeerService(null, 'mixin'));
    }
    return this.services;
  }

  //
  // initialize
  //
  // the information needed to access Mixin through its API requires data that is
  // stored in the ENV of the server that is running Saito. On initialization we
  // fetch this information and put it into the "this.bot" variable.
  //
  async initialize(app) {
    await super.initialize(app);
    await this.load();

    if (!app.BROWSER) {
      if (!this.bot) {
        let m = null;

        try {
          if (typeof process.env.MIXIN != 'undefined') {
            m = JSON.parse(process.env.MIXIN);
          }
        } catch (err) {}

        if (m) {
          const keystore = {
            app_id: m.app_id,
            session_id: m.session_id,
            server_public_key: m.server_public_key,
            session_private_key: m.session_private_key
          };

          this.bot = MixinApi({ keystore });
        }
      }
    }

    this.installCryptos();
  }

  //
  // off-chain requests
  //
  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    let message = tx.returnMessage();

    //
    // create account
    //
    if (message.request === 'mixin create account') {
      return await this.receiveCreateAccountTransaction(app, tx, peer, mycallback);
    }

    //
    // save new deposit address (when enabling new crypto)
    //
    if (message.request === 'mixin save new deposit address') {
      return await this.receiveSaveUserTransaction(app, tx, peer, mycallback);
    }

    //
    // sendPayment, returnWithdrawalFeeForAddress, getMixinAddress
    //
    if (message.request === 'mixin fetch user') {
      await this.receiveFetchUserTransaction(app, tx, peer, mycallback);
      return 1;
    }

    //
    // backup account (no reset)
    //
    if (message.request === 'mixin account backup') {
      await this.receiveMixinBackupAccountRequest(message.data.account_hash, peer.publicKey, false);
      if (mycallback) {
        mycallback();
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  respondTo(type = '', obj) {
    if (type == 'crypto-logo') {
      let ticker = obj.ticker;
      for (let cm of this.crypto_mods)
        if (ticker == cm.ticker) {
          if (cm.respondTo('crypto-logo', obj)) {
            return cm.respondTo('crypto-logo', obj);
          }

          let rtn_obj = {};

          if (cm.icon_url) {
            rtn_obj.img = cm.icon_url;
            rtn_obj.alt_img = `/${ticker.toLowerCase()}/img/logo.png`;
          } else {
            rtn_obj.img = `/${ticker.toLowerCase()}/img/logo.png`;
          }

          if (cm.chain_id !== cm.asset_id) {
            for (let i = 0; i < this.crypto_mods.length; i++) {
              if (this.crypto_mods[i].asset_id == cm.chain_id) {
                rtn_obj.sub_logo = `/${this.crypto_mods[i].ticker.toLowerCase()}/img/logo.png`;
              }
            }
          }

          return rtn_obj;
        }
    }

    return null;
  }
  //
  // installCryptos
  //
  // this checks all modules that extend from the MixinModule template in the /lib
  // directory. this ensures those modules are initialized and fetches the balance
  // for any which are activated as the default web3 crypto.
  //
  installCryptos() {
    let mixin_self = this;
    let rtModules = this.app.modules.respondTo('mixin-crypto');

    for (let i = 0; i < rtModules.length; i++) {
      let crypto_module = new MixinModule(
        this.app,
        mixin_self,
        rtModules[i].ticker,
        rtModules[i].asset_id,
        rtModules[i].chain_id
      );

      //
      // Use the module's returnBalance function if provided
      //
      if (rtModules[i].returnBalance) {
        crypto_module.returnBalance = rtModules[i].returnBalance;
      }

      if (this.app.BROWSER) {
        if (!this.app.browser.returnURLParameter('withdraw')) {
          if (rtModules[i].name !== rtModules[i].ticker) {
            console.warn(
              'Installing a ghost crypto module: ',
              rtModules[i].name,
              rtModules[i].ticker
            );
            crypto_module.hide_me = true;
          }
        }
      }

      this.crypto_mods.push(crypto_module);
      this.app.modules.mods.push(crypto_module);

      setTimeout(async () => {
        if (typeof crypto_module?.returnMixinNetworkInfo === 'function') {
          await crypto_module.returnMixinNetworkInfo();
        }

        //
        // necessary for module functionality
        //
        await crypto_module.installModule(mixin_self.app);

        if (mixin_self.account_created) {
          // We don't want to activate every crypto in the wallet, only
          // the ones that users have already manually activated
          if (crypto_module.isActivated() || crypto_module.address) {
            await crypto_module.activate();
          }
        }
      }, 250);
    }
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'mixin') {
      console.info('Mixin Module: API online!');
      this.mixin_peer = peer;

      if (this.mixin.user_id) {
        if (!this.mixin.backed_up) {
          console.info('Need to back up my mixin');
          let input = Buffer.from(JSON.stringify(this.mixin), 'utf8');
          let account_hash = this.app.crypto
            .encryptWithPublicKey(input, this.publicKey)
            .toString('base64');

          this.app.network.sendRequestAsTransaction(
            'mixin account backup',
            { account_hash },
            () => {
              this.mixin.backed_up = true;
              this.save();
            },
            peer.publicKey
          );
        }
      }
    }
  }

  //
  // The following functions are used by the /lib/mixinmodule.js class that is the
  // parent module for any Saito Module that implements a Mixin ticker. Please be careful
  // when changing names or updating function contents for these functions...
  //
  // Core MixinModule API:
  // ---------------------
  // * createAccount()
  // * createDepositAddress()
  // fetchSafeUtxoBalance()
  // fetchUtxo()
  // fetchSafeSnapshots()
  // fetchPendingDeposits()
  // returnMixinNetworkInfo()
  // returnWithdrawalFee()
  // sendInNetworkTransferRequest()
  // sendExternalNetworkTransferRequest()
  // sendFetchUserTransaction()
  // ---------------------
  //

  async createAccount(callback = null, force_new = false) {
    let result;

    if (this.account_created && !force_new) {
      console.warn('You already have a Mixin Account created...');
      result = { keys: this.mixin, existing: true };
    } else if (!force_new && this.account_creation_promise) {
      result = await this.account_creation_promise;
    } else {
      const createAccount = async () => {
        const privateKey = await this.app.wallet.getPrivateKey();
        let response;

        if (this.mixin_peer) {
          console.log(
            'Request remote node to create Mixin User Account',
            this.mixin_peer.publicKey
          );

          response = await new Promise((resolve) => {
            let settled = false;
            const finish = (res) => {
              if (!settled) {
                settled = true;
                clearTimeout(timeout);
                resolve(res);
              }
              return res;
            };
            const timeout = setTimeout(
              () => finish({ err: 'Mixin account service timed out' }),
              30000
            );

            try {
              Promise.resolve(this.sendCreateAccountTransaction(finish, force_new)).catch((err) =>
                finish({ err: formatMixinError(err) })
              );
            } catch (err) {
              finish({ err: formatMixinError(err) });
            }
          });
        } else if (this.app.BROWSER) {
          response = { err: 'Mixin account service is unavailable' };
        } else {
          console.log('==> Create Mixin User Account on Same Node as API Keys');
          response = await this.createMixinUserAccount(this.publicKey, null, force_new);
        }

        if (typeof response !== 'object' || !response?.res) {
          const error = response?.err || 'Mixin account service returned no account';
          console.error('Mixin Account Error:', error);
          return { err: error };
        }

        try {
          const res = { ...response };
          const encrypted = Buffer.from(res.res, 'base64');
          const decrypted = this.app.crypto.decryptWithPrivateKey(encrypted, privateKey);
          res.keys = JSON.parse(decrypted.toString('utf8'));

          if (res.restored) {
            console.log('Successfully Restored Mixin Account!');
          } else {
            console.log('Successfully Created Mixin Account!');
          }

          // Skip save step if we are creating multiple accounts on the same public key.
          if (!force_new) {
            this.mixin = res.keys;
            this.account_created = 1;
            this.save();
          }

          return res;
        } catch (err) {
          const error = `Unable to decrypt Mixin account: ${formatMixinError(err)}`;
          console.error(error);
          return { err: error };
        }
      };

      if (force_new) {
        result = await createAccount();
      } else {
        this.account_creation_promise = createAccount();
        try {
          result = await this.account_creation_promise;
        } finally {
          this.account_creation_promise = null;
        }
      }
    }

    if (callback) {
      await callback(result);
    }

    return result;
  }

  sendCreateAccountTransaction(callback = null, force_new = false) {
    let mixin_self = this;

    let data = { force_new };
    return mixin_self.app.network.sendRequestAsTransaction(
      'mixin create account',
      data,
      callback,
      mixin_self.mixin_peer?.publicKey
    );
  }

  receiveCreateAccountTransaction(app, tx, peer, callback) {
    let pkey = tx.from[0].publicKey;
    let txmsg = tx.returnMessage();

    return this.createMixinUserAccount(pkey, callback, txmsg.data?.force_new);
  }

  async createMixinUserAccount(pkey, callback, force_new = false) {
    // Check if account is already created and in DB
    const rtn_obj = {};
    let success = false;
    let user_id = `Saito User ${pkey}`;

    if (!force_new) {
      let db_results = await this.restoreMixinAccount(pkey);

      if (db_results?.length > 0) {
        // default to the most recent (if there is more than 1)
        rtn_obj.res = db_results.pop().account_hash;
        rtn_obj.restored = true;
        success = true;
      }
    } else {
      user_id = `${pkey}_${force_new.toString().padStart(3, '0')}`;
    }
    if (!success) {
      if (this.bot) {
        try {
          const { seed: sessionSeed, publicKey: sessionPublicKey } = getED25519KeyPair();
          const session_private_key = sessionSeed.toString('hex');

          const user = await this.bot.user.createBareUser(
            user_id,
            base64RawURLEncode(sessionPublicKey)
          );

          console.log('user //', user.user_id);

          // update/create first tipPin
          const userClient = MixinApi({
            keystore: {
              app_id: user.user_id,
              session_id: user.session_id,
              pin_token_base64: user.pin_token_base64,
              session_private_key
            }
          });

          const { publicKey: spendPublicKey, seed: spendPrivateKey } = getED25519KeyPair();

          const spend_private_key = spendPrivateKey.toString('hex');

          await userClient.pin.updateTipPin(
            '',
            spendPublicKey.toString('hex'),
            user.tip_counter + 1
          );
          console.log('update pin //');

          await userClient.pin.verifyTipPin(spendPrivateKey);
          console.log('verify pin //');

          const account = await userClient.safe.register(
            user.user_id,
            spend_private_key,
            spendPrivateKey
          );

          console.log('safe account ///', account.user_id, account.has_safe);

          const buf = Buffer.from(
            JSON.stringify({
              user_id: account.user_id,
              full_name: account.full_name,
              session_id: account.session_id,
              tip_key_base64: account.tip_key_base64,
              spend_private_key,
              spend_public_key: spendPublicKey.toString('hex'),
              session_seed: session_private_key,
              backed_up: true
            }),
            'utf8'
          );

          const encrypted_data = this.app.crypto.encryptWithPublicKey(buf, pkey).toString('base64');

          rtn_obj.res = encrypted_data;

          // Skip save step if we are creating multiple accounts on the same public key
          if (!force_new) {
            await this.backupMixinAccount(encrypted_data, pkey);
          }
        } catch (err) {
          console.error('Mixin Create Account Error', err);
          Object.assign(rtn_obj, { err: 'Mixin create account error' });
        }
      } else {
        Object.assign(rtn_obj, { err: 'Cannot process Mixin account request for peer' });
      }
    }

    if (callback) {
      return callback(rtn_obj);
    } else {
      return rtn_obj;
    }
  }

  async createDepositAddress(asset_id, chain_id, alt_keys = null) {
    if (!chain_id) {
      console.error('ERROR: Cannot create Mixin deposit address without a chain ID');
      return false;
    }

    try {
      const account = alt_keys || this.mixin;
      const { keystore } = createMixinCredentials(account);
      const user = MixinApi({ keystore });
      const address = await user.safe.createDeposit(chain_id);
      const destination = address?.[0]?.destination;

      console.log('New MIXIN deposit address:', address);

      if (!destination) {
        console.error('ERROR: Mixin error create deposit address: Deposit Address undefined!');
        return false;
      }

      if (!alt_keys) {
        for (let i = 0; i < this.crypto_mods.length; i++) {
          if (this.crypto_mods[i].asset_id === asset_id) {
            this.crypto_mods[i].address = destination;
            this.crypto_mods[i].save();

            if (this.app.BROWSER) {
              this.app.network.sendRequestAsTransaction(
                'mixin save new deposit address',
                {
                  user_id: this.mixin.user_id,
                  asset_id: asset_id,
                  address: destination,
                  publickey: this.publicKey
                },
                function (res) {
                  console.log('Callback for sendSaveUserTransaction request: ', res);
                },
                this.mixin_peer?.publicKey
              );
            }
          }
        }
      }

      return destination;
    } catch (err) {
      console.error('ERROR: Mixin error create deposit address: ' + formatMixinError(err));
      return false;
    }
  }

  async fetchSafeUtxoBalance(asset_id) {
    try {
      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      let utxo = await user.utxo.safeAssetBalance({
        members: [this.mixin.user_id],
        threshold: 1,
        asset: asset_id
      });

      return utxo;
    } catch (err) {
      console.error('ERROR: Mixin error fetch safe utxo: ' + err);
      return false;
    }
  }

  /***
   *  Returns a chronological Array of Objects with the format
   *
   * snapshot_id: "6049b6c2-3f9e-3627-b671-c81f4f6a88fa"
   * user_id: "95b8a0a4-1032-33e7-9154-5f48ebe00a14"
   * opponent_id: "dac46e33-fdd2-3453-b77a-73ffadba1ff1"
   * transaction_hash: "1db6dc53df33bfc7dd38afa86eb83454b5b71bc178da653431ddc9af025a7487"
   * asset_id: "43d61dcd-e413-450d-80b8-101d5e903357"
   * kernel_asset_id: "8dd50817c082cdcdd6f167514928767a4b52426997bd6d4930eca101c5ff8a27"
   * amount: "0.005"
   * memo: "746573742d6d656d6f"
   * request_id: "bfb05bb6-03e5-4b5c-a7ab-2ad5a4ed56a7"
   * created_at: "2025-08-25T03:23:17.657426Z"
   * level: 11
   * type: "snapshot"
   * inscription_hash: "INSCRIPTION-HASH"
   * deposit: { "deposit_hash": "DEPOSIT-HASH", "deposit_index": 1,
          "sender": "SOME-STRING", "destination": "DEPOSIT-DESTINATION", "tag": "DEPOSIT-TAG" }
   * withdrawal: { "withdrawal_hash": "WITHDRAWAL-HASH", "receiver": "SOME-STRING"  }
   *
   */
  async fetchSafeSnapshots(asset_id, created_at = 0, callback = null) {
    try {
      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      let offset = new Date(created_at).toISOString();
      offset = offset.substring(0, offset.length - 1);
      offset = offset + '000000Z';

      let snapshots = await user.safe.fetchSafeSnapshots({
        asset: asset_id,
        limit: 500,
        offset
      });

      if (callback) {
        callback(snapshots);
      }
      return snapshots;
    } catch (err) {
      console.error('ERROR: Mixin error fetch safe snapshots: ' + err);
      if (callback) {
        callback(false);
      }
      return false;
    }
  }

  /**
 * "data": [
    {
        "deposit_id": "UUID-DEPOSIT",
        "destination": "ADDRESS",
        "tag": "TAG",
        "chain_id": "CHAIN-UUID",
        "asset_id": "ASSET-UUID",
        "asset_key": "CHAIN-ASSET-KEY",
        "amount": "NUMBER",
        "transaction_hash": "BLOCKCHAIN-SPECIFIC-HASH",
        "output_index": 0,
        "block_hash": "BLOCKCHAIN-SPECIFIC-HASH",
        "block_number": 333333,
        "confirmations": 5,
        "threshold": 10,
        "state": "pending or confirmed",
        "created_at": "RFC3339NANO",
        "updated_at": "RFC3339NANO"
    }
  ]
 */
  async fetchPendingDeposits(asset_id, destination, callback) {
    try {
      if (!destination) {
        return callback([]);
      }

      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      let params = {
        asset: asset_id,
        destination: destination
      };

      let deposits = await user.safe.pendingDeposits(params);
      return callback(deposits);
    } catch (err) {
      console.error('ERROR: Mixin error fetch fetchPendingDeposits: ' + err);
      return false;
    }
  }

  // Custom function to play nicely with BuySaito ... can't fck with callbacks
  async consolidatedLookUp(ticker, destination, created_at, keys) {
    let asset_id;

    // Note to self: if we ever support duplicate tickers on different chains
    // (with different asset ids..), will need to fix a lot of things

    for (let cm of this.crypto_mods) {
      if (cm.ticker == ticker) {
        asset_id = cm.asset_id;
      }
    }

    let user = MixinApi({
      keystore: {
        app_id: keys.user_id,
        session_id: keys.session_id,
        pin_token_base64: keys.tip_key_base64,
        session_private_key: keys.session_seed
      }
    });

    let params = {
      asset: asset_id,
      destination: destination
    };

    let deposits = await user.safe.pendingDeposits(params);

    let utxo = await user.utxo.safeAssetBalance({
      members: [keys.user_id],
      threshold: 1,
      asset: asset_id
    });

    let offset = new Date(created_at).toISOString();
    offset = offset.substring(0, offset.length - 1);
    offset = offset + '000000Z';

    let snapshots = await user.safe.fetchSafeSnapshots({
      asset: asset_id,
      limit: 100,
      offset
    });

    return { deposits, utxo, snapshots };
  }

  async fetchUtxo(state = 'unspent', limit = 100000, order = 'DESC', callback = null) {
    try {
      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      let params = {
        limit: limit,
        state: state,
        order: order
      };

      let utxo_list = await user.utxo.safeOutputs(params);
      console.log(`utxo_list ${state}:///`, utxo_list);

      if (callback) {
        return callback(utxo_list);
      }
    } catch (err) {
      console.error('ERROR: Mixin error return utxo: ' + err);
      return false;
    }
  }

  async returnMixinNetworkInfo(asset_id) {
    try {
      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      let asset = await user.network.fetchAsset(asset_id);

      return asset;
    } catch (err) {
      console.error('ERROR: Mixin error check network fee: ' + err);
      return false;
    }
  }

  async returnWithdrawalFee(asset_id, recipient) {
    try {
      let user = MixinApi({
        keystore: {
          app_id: this.mixin.user_id,
          session_id: this.mixin.session_id,
          pin_token_base64: this.mixin.tip_key_base64,
          session_private_key: this.mixin.session_seed
        }
      });

      const asset = await user.safe.fetchAsset(asset_id);
      const chain =
        asset.chain_id === asset.asset_id ? asset : await user.safe.fetchAsset(asset.chain_id);
      const feeResponse = await user.safe.fetchFee(asset.asset_id, recipient);
      const fee = selectWithdrawalFee(feeResponse, asset.asset_id, chain.asset_id);

      if (!fee?.asset_id || fee.amount == null) {
        throw new Error(`No withdrawal fee available for ${asset_id}`);
      }

      const feeAsset =
        fee.asset_id === asset.asset_id
          ? asset
          : fee.asset_id === chain.asset_id
            ? chain
            : await user.safe.fetchAsset(fee.asset_id);

      return {
        ...fee,
        ticker: feeAsset.display_symbol || feeAsset.symbol
      };
    } catch (err) {
      console.error('ERROR: Mixin error check withdrawl fee: ' + err);
      return false;
    }
  }

  async sendInNetworkTransferRequest(asset_id, destination, amount, memo = '', alt_keys = null) {
    try {
      // Preserve the existing alternate-account call signature used by BuySaito.
      if (memo && typeof memo === 'object' && !Buffer.isBuffer(memo)) {
        alt_keys = memo;
        memo = '';
      }

      const { keystore, spend_private_key, user_id } = createMixinCredentials(
        alt_keys || this.mixin
      );
      const client = MixinApi({ keystore });

      // destination
      const members = [destination];
      const threshold = 1;
      const recipients = [buildSafeTransactionRecipient(members, threshold, amount)];

      // get unspent utxos
      const outputs = await client.utxo.safeOutputs({
        members: [user_id],
        threshold: 1,
        asset: asset_id,
        state: 'unspent'
      });
      console.log('outputs: ', outputs);
      const balance = await client.utxo.safeAssetBalance({
        members: [user_id],
        threshold: 1,
        asset: asset_id,
        state: 'unspent'
      });
      console.log('balance: ', balance);

      // Get utxo inputs and change fot tx
      const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);
      if (!change.isZero() && !change.isNegative()) {
        recipients.push(
          buildSafeTransactionRecipient(
            outputs[0].receivers,
            outputs[0].receivers_threshold,
            change.toString()
          )
        );
      }

      console.log('mixin checkpoint');

      const request_id = v4();
      const ghosts = await client.utxo.ghostKey(recipients, request_id, spend_private_key);

      console.log('ghosts: ', ghosts);

      // build safe transaction raw
      const tx = buildSafeTransaction(utxos, recipients, ghosts, createMixinMemo(memo));
      console.log('tx: ', tx);
      let raw;
      try {
        raw = encodeSafeTransaction(tx);
      } catch (err) {
        throw new Error(
          `Unable to encode Mixin Safe transaction (${tx.inputs.length} input(s), ${tx.outputs.length} output(s), asset ${tx.asset}): ${formatMixinError(err)}`
        );
      }
      console.log('raw: ', raw);

      // verify safe transaction
      const verifiedTx = await client.utxo.verifyTransaction([
        {
          raw,
          request_id
        }
      ]);
      console.log('verifiedTx: ', verifiedTx);

      // sign safe transaction with the private key registerd to safe
      const signedRaw = signSafeTransaction(tx, verifiedTx[0].views, spend_private_key);
      console.log('signedRaw:', signedRaw);
      const sendedTx = await client.utxo.sendTransactions([
        {
          raw: signedRaw,
          request_id: request_id
        }
      ]);

      console.log('sendedTx: ', sendedTx);
      return {
        status: 200,
        message: sendedTx,
        pending_balance: calculatePendingBalance(balance, amount)
      };
    } catch (err) {
      const message = formatMixinError(err);
      console.error('Mixin internal transfer failed:', message);
      return { status: 400, message };
    }
  }

  async sendExternalNetworkTransferRequest(asset_id, destination, amount, memo = '') {
    try {
      const { keystore, spend_private_key, user_id } = createMixinCredentials(this.mixin);
      const user = MixinApi({ keystore });
      const balance = await user.utxo.safeAssetBalance({
        members: [user_id],
        threshold: 1,
        asset: asset_id,
        state: 'unspent'
      });

      const asset = await user.safe.fetchAsset(asset_id);
      const chain =
        asset.chain_id === asset.asset_id ? asset : await user.safe.fetchAsset(asset.chain_id);
      const feeResponse = await user.safe.fetchFee(asset.asset_id, destination);
      const fee = selectWithdrawalFee(feeResponse, asset.asset_id, chain.asset_id);
      if (!fee?.asset_id || fee.amount == null) {
        throw new Error(`No withdrawal fee available for ${asset_id}`);
      }
      const assetTicker =
        this.crypto_mods.find((crypto_module) => crypto_module.asset_id === asset.asset_id)
          ?.ticker ||
        asset.display_symbol ||
        asset.symbol;
      const feeAsset =
        fee.asset_id === asset.asset_id
          ? asset
          : fee.asset_id === chain.asset_id
            ? chain
            : await user.safe.fetchAsset(fee.asset_id);
      const feeTicker =
        this.crypto_mods.find((crypto_module) => crypto_module.asset_id === fee.asset_id)?.ticker ||
        feeAsset.display_symbol ||
        feeAsset.symbol;
      const assetRequired = new Decimal(amount).plus(
        fee.asset_id === asset.asset_id ? fee.amount : 0
      );

      if (new Decimal(balance).lessThan(assetRequired)) {
        throw new Error(
          `Insufficient ${assetTicker} balance: ${assetRequired.toString()} required, ${balance} available.`
        );
      }
      console.log('fee', fee);
      console.log('balance: ', balance);

      // withdrawal with chain asset as fee
      if (fee.asset_id !== asset.asset_id) {
        const outputs = await user.utxo.safeOutputs({
          asset: asset_id,
          state: 'unspent'
        });
        const feeOutputs = await user.utxo.safeOutputs({
          asset: fee.asset_id,
          state: 'unspent'
        });
        const feeBalance = await user.utxo.safeAssetBalance({
          members: [user_id],
          threshold: 1,
          asset: fee.asset_id,
          state: 'unspent'
        });

        if (new Decimal(feeBalance).lessThan(fee.amount)) {
          throw new Error(
            `A ${feeTicker} balance is required to withdraw ${assetTicker}. ` +
              `The network fee is ${fee.amount} ${feeTicker}, but only ${feeBalance} ${feeTicker} is available.`
          );
        }
        console.log('outputs: ', outputs, 'feeOutputs: ', feeOutputs);

        let recipients = [
          // withdrawal output, must be put first
          {
            amount: amount,
            destination: destination
          }
        ];
        const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);
        if (!change.isZero() && !change.isNegative()) {
          // add change output if needed
          recipients.push(
            buildSafeTransactionRecipient(
              outputs[0].receivers,
              outputs[0].receivers_threshold,
              change.toString()
            )
          );
        }

        // get ghost key to send tx
        const txId = v4();
        const ghosts = await user.utxo.ghostKey(recipients, txId, spend_private_key);

        // ghostKey already leaves the withdrawal entry undefined and index-aligned.
        const tx = buildSafeTransaction(utxos, recipients, ghosts, createMixinMemo(memo));
        console.log('tx: ', tx);
        const raw = encodeSafeTransaction(tx);
        const ref = blake3Hash(Buffer.from(raw, 'hex')).toString('hex');

        const feeRecipients = [
          // fee output
          buildSafeTransactionRecipient([MixinCashier], 1, fee.amount)
        ];
        const { utxos: feeUtxos, change: feeChange } = getUnspentOutputsForRecipients(
          feeOutputs,
          feeRecipients
        );
        if (!feeChange.isZero() && !feeChange.isNegative()) {
          // add fee change output if needed
          feeRecipients.push(
            buildSafeTransactionRecipient(
              feeOutputs[0].receivers,
              feeOutputs[0].receivers_threshold,
              feeChange.toString()
            )
          );
        }
        const feeId = v4();
        const feeGhosts = await user.utxo.ghostKey(feeRecipients, feeId, spend_private_key);
        const feeTx = buildSafeTransaction(feeUtxos, feeRecipients, feeGhosts, createMixinMemo(), [
          ref
        ]);
        console.log('feeTx: ', feeTx);
        const feeRaw = encodeSafeTransaction(feeTx);
        console.log('feeRaw: ', feeRaw);

        //console.log(txId, feeId);
        let txs = await user.utxo.verifyTransaction([
          {
            raw,
            request_id: txId
          },
          {
            raw: feeRaw,
            request_id: feeId
          }
        ]);

        const signedRaw = signSafeTransaction(tx, txs[0].views, spend_private_key);
        const signedFeeRaw = signSafeTransaction(feeTx, txs[1].views, spend_private_key);
        const res = await user.utxo.sendTransactions([
          {
            raw: signedRaw,
            request_id: txId
          },
          {
            raw: signedFeeRaw,
            request_id: feeId
          }
        ]);

        console.log('res: ', res);
        return {
          status: 200,
          message: res,
          pending_balance: calculatePendingBalance(balance, amount)
        };
      } else {
        // withdrawal with asset as fee
        const outputs = await user.utxo.safeOutputs({
          asset: asset_id,
          state: 'unspent'
        });
        console.log('outputs: ', outputs);

        let recipients = [
          // withdrawal output, must be put first
          {
            amount: amount,
            destination: destination
          },
          // fee output
          buildSafeTransactionRecipient([MixinCashier], 1, fee.amount)
        ];
        const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);
        if (!change.isZero() && !change.isNegative()) {
          // add change output if needed
          recipients.push(
            buildSafeTransactionRecipient(
              outputs[0].receivers,
              outputs[0].receivers_threshold,
              change.toString()
            )
          );
        }

        console.log('mixin checkpoint');

        const request_id = v4();
        const ghosts = await user.utxo.ghostKey(recipients, request_id, spend_private_key);
        const tx = buildSafeTransaction(utxos, recipients, ghosts, createMixinMemo(memo));
        console.log('tx: ', tx);
        const raw = encodeSafeTransaction(tx);

        console.log(request_id);
        let txs = await user.utxo.verifyTransaction([
          {
            raw,
            request_id
          }
        ]);

        const signedRaw = signSafeTransaction(tx, txs[0].views, spend_private_key);
        const res = await user.utxo.sendTransactions([
          {
            raw: signedRaw,
            request_id
          }
        ]);
        console.log('res: ', res);
        return {
          status: 200,
          message: res,
          pending_balance: calculatePendingBalance(balance, amount, fee.amount)
        };
      }
    } catch (err) {
      const message = formatMixinError(err);
      console.error('Mixin external transfer failed:', message);
      return { status: 400, message };
    }
  }

  /**
   *
   * TODO -- we want a uniqueness constraint so we don't make duplicate entries
   * everytime a user ports their key and "recovers" their mixin credentials
   */
  async receiveSaveUserTransaction(app, tx, peer, callback) {
    let message = tx.returnMessage();

    let user_id = message.data.user_id;
    let address = message.data.address;
    let publickey = message.data.publickey;
    let asset_id = message.data.asset_id;
    let created_at = tx.timestamp;
    let updated_at = tx.timestamp;

    let sql = `INSERT INTO mixin_users (user_id,
        address,
        publickey,
        asset_id,
        created_at,
        updated_at)
      VALUES ($user_id,
        $address,
        $publickey,
        $asset_id,
        $created_at,
        $updated_at
    )`;

    let params = {
      $user_id: user_id,
      $address: address,
      $publickey: publickey,
      $asset_id: asset_id,
      $created_at: created_at,
      $updated_at: updated_at
    };

    let result = await this.app.storage.runDatabase(sql, params, 'mixin');
    console.log(result);
    if (callback) {
      return callback(result);
    }
  }

  async backupMixinAccount(data, pkey, delete_first = false) {
    if (delete_first) {
      let sql2 = `DELETE FROM mixin_accounts WHERE publickey = $publickey`;
      let params2 = { $publickey: pkey };
      let r = await this.app.storage.runDatabase(sql2, params2, 'mixin');
      console.log(`Mixin cleanup for ${pkey}: `, r);
    }

    let sql = `INSERT INTO mixin_accounts (publickey, account_hash) VALUES ($publickey, $account_hash)`;
    let params = {
      $publickey: pkey,
      $account_hash: data
    };

    let result = await this.app.storage.runDatabase(sql, params, 'mixin');
    return result;
  }

  async restoreMixinAccount(pkey) {
    let sql = `SELECT * FROM mixin_accounts WHERE publickey = $publickey`;
    let params = { $publickey: pkey };
    let result = await this.app.storage.queryDatabase(sql, params, 'mixin');
    return result;
  }

  async sendFetchUserTransaction(params = {}, callback = null) {
    return this.app.network.sendRequestAsTransaction(
      'mixin fetch user',
      params,
      function (res) {
        console.log('Callback for sendFetchUser: ', params, res);
        if (callback) {
          callback(res);
        }
        return res;
      },
      this.mixin_peer?.publicKey
    );
  }

  async receiveFetchUserTransaction(app, tx, peer, callback = null) {
    let data = tx.returnMessage().data;
    let filters = [];
    let params = {};

    if (!data?.asset_id) {
      return callback?.([]);
    }

    if (data?.address) {
      filters.push('address = $address');
      params['$address'] = data.address;
    }

    if (data?.publicKey) {
      filters.push('publickey = $publickey');
      params['$publickey'] = data.publicKey;
    }

    if (data?.user_id) {
      filters.push('user_id = $user_id');
      params['$user_id'] = data.user_id;
    }

    if (!filters.length) {
      return callback?.([]);
    }

    filters.push('asset_id = $asset_id');
    params['$asset_id'] = data.asset_id;
    const sql = `SELECT * FROM mixin_users WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`;

    console.log('*****', sql, params);

    try {
      let result = await this.app.storage.queryDatabase(sql, params, 'mixin');
      return callback?.(result);
    } catch (err) {
      console.error(err);
    }
    return callback?.([]);
  }

  async load() {
    if (this.app?.options?.mixin) {
      console.log('USING SAVED MIXIN USER ACCOUNT');
      this.mixin = this.app.options.mixin;
      if (this.mixin.user_id) {
        this.account_created = 1;

        //check if legacy user
        if (typeof this.mixin.pin_token_base64 != 'undefined') {
          await this.saveLegacy();
          this.account_created = 0;
          this.mixin = {};
          this.save();

          await this.app.wallet.setPreferredCrypto('SAITO', 1);
        }
      }
    }
  }

  save() {
    this.app.options.mixin = this.mixin;
    this.app.storage.saveOptions();
  }

  async saveLegacy() {
    this.app.options.mixin_legacy = this.mixin;
    this.app.storage.saveOptions();
  }
}

module.exports = Mixin;
