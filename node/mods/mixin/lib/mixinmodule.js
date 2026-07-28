/*********************************************************************************

 WEB3 CRYPTO MODULE v.2 - Mixin

 Extends the generic web3 crypto module to add auto-support for cryptos that are
 supported by the Mixin module.

 returnPrivateKey()
 async sendPayment(amount="", recipient="", unique_hash="")
 async receivePayment(amount="", sender="", recipient="", timestamp=0, unique_hash="")


 Uses Mixin API:
 ----------------
 createAccount()
 createDepositAddress()
 fetchSafeUtxoBalance()
 fetchUtxo()
 fetchSafeSnapshots()
 fetchSnapshots()
 fetchPendingDeposits()
 sendInNetworkTransferRequest()
 sendExternalNetworkTransferRequest()
 returnMixinNetworkInfo()
 returnWithdrawalFee()
 deposit[]
 mixin.privatekey
 mixin.user_id


 **********************************************************************************/
const CryptoModule = require('./../../../lib/templates/cryptomodule');
const getUuid = require('uuid-by-string');
//
// TODO - this is old and deprecated and doesn't compile well with ().default bundled
// code as we require. so we should be updating address validation if we need it, but
// this should not be blocking us.
//
const WAValidator = require('@taasfi/multicoin-address-validator');

class MixinModule extends CryptoModule {
  constructor(app, mixin_mod, ticker, asset_id, chain_id) {
    super(app, ticker);

    this.mixin = mixin_mod;

    this.asset_id = asset_id;
    this.chain_id = chain_id;

    this.polling_active = 0;
    this.polling_timeout = 0;
    this.polling_intervals = [5000, 15000, 45000, 90000, 120000, 180000];
    this.polling_interval_current = 0;

    this.cached_contacts = [];

    this.confirmations = 100;
  }

  async activate() {
    if (this.mixin.account_created == 0) {
      console.info('Create Mixin account');
      await this.mixin.createAccount((res) => {
        if (res.err || Object.keys(res).length < 1) {
          if (this.app.BROWSER) {
            salert('Having problem generating key for ' + ' ' + this.ticker);
          }
          this.app.wallet.setPreferredCrypto('SAITO');
          return null;
        }

        return this.activate();
      });
    } else {
      if (!this.address) {
        console.info(`Create Mixin deposit address -- ${this.ticker}`);

        let rv = await this.mixin.createDepositAddress(this.asset_id, this.chain_id);
        if (!rv) {
          if (this.app.BROWSER) {
            salert('Having problem generating key for ' + ' ' + this.ticker);
          }
          await this.app.wallet.setPreferredCrypto('SAITO');
        } else {
          console.info(`Address for ${this.ticker}: ${this.address}`);
        }
      }

      await super.activate();
    }
  }

  async loadHistory() {
    await super.loadHistory();
    await this.checkForRecentTransactions();
  }

  //
  // Balance state (see also getPendingBalance, sendPayment, checkForRecentTransactions):
  //
  // - balance: confirmed Safe UTXO from fetchSafeUtxoBalance; persisted via save()
  // - pending_balance: ephemeral post-send expected balance until the API reflects the
  //   transfer; also drives returnDisplayBalance() and header "pending" styling
  // - last_balance: ephemeral pre-send snapshot for a synthetic pending row in the
  //   transaction history overlay until the snapshot lands in history
  //
  // pending_balance and last_balance are not persisted in save().
  //
  async fetchBalance() {
    if (!this.address) {
      console.info('Mixin Error: no address - terminating fetch balance');
      return;
    }

    let ts = Date.now();
    //
    // We are adding some throttling here because this was getting called > 10 times
    // just on page load. The polling / checkForRecentTransactions will clear the flag
    // if there is any activity that would update things
    //
    if (!this.last_balance_fetch || ts - this.last_balance_fetch > 10000) {
      console.log('@@@ FetchBalance ' + this.ticker);
      this.last_balance_fetch = ts;

      let balance = await this.mixin.fetchSafeUtxoBalance(this.asset_id);
      if (balance !== false) {
        // API caught up to the post-send estimate; drop the optimistic override.
        if (balance == this.pending_balance) {
          delete this.pending_balance;
        }
        if (this.balance != balance) {
          this.balance = balance;
          this.save();
        }
      }
    }

    return this.balance;
  }

  async getAvailableBalance() {
    return this.fetchBalance();
  }

  //
  // queries the latest pending balance
  //
  async getPendingBalance() {
    let pending_balance = Number(await this.getAvailableBalance());

    // Did we cache a pending balance because we just sent some tokens and cannot trust the safeUTXOBalance?
    if (this.pending_balance) {
      if (pending_balance !== this.pending_balance) {
        pending_balance = this.pending_balance;
      }
    }

    // Do we have incoming deposits from outside the platform?
    this.pending_deposits = await this.fetchPendingDeposits();

    for (let pd of this.pending_deposits) {
      if (pd.state === 'pending' || Number(pd.confirmations) < Number(this.confirmations)) {
        pending_balance += Number(pd.amount || 0);
      }
    }

    return pending_balance.toString() || '0';
  }

  /*
   *
   * PENDING DEPOSITS are returned from MIXIN in this fashion
   *
   * this.pending_deposits = [
   *   {
   *     deposit_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
   *     destination: "0xDepositAddressForThisAsset...",
   *     tag: "",
   *     chain_id: "b7938390-ff6d-4be9-aa99-1a7ede2b7276",
   *     asset_id: "c6d0c728-2624-429b-8e0d-d563e5f5ee48",
   *     asset_key: "ETH",
   *     amount: "0.125",              // string; use Number() in UI
   *     transaction_hash: "0xabc...",
   *     output_index: 0,
   *     block_hash: "0xdef...",
   *     block_number: 19876543,
   *     confirmations: 5,             // used by saito-header / deposit overlay
   *     threshold: 100,             // network confirmation target (often matches module.confirmations)
   *     state: "pending",             // e.g. "pending" | "confirmed"
   *     created_at: "2024-02-12T16:31:44.123456789Z",
   *     updated_at: "2024-02-12T16:32:01.987654321Z"
   *   }
   * ];
   */
  async fetchPendingDeposits(callback = null) {
    if (!this.address) {
      this.pending_deposits = [];
      if (callback) callback([]);
      return [];
    }

    this.pending_deposits = await new Promise((resolve) => {
      this.mixin.fetchPendingDeposits(this.asset_id, this.address, (res) => {
        if (res === false) {
          resolve(this.pending_deposits || []);
          return;
        }
        resolve(res || []);
      });
    });

    if (callback) {
      callback(this.pending_deposits);
    }

    return this.pending_deposits;
  }

  getSaitoPublicKey(user_id) {
    //
    // check if address exists in local db
    //
    for (let pk in this.cached_contacts) {
      if (this.cached_contacts[pk].includes(user_id)) {
        return pk;
      }
    }

    for (let k of this.app.keychain.returnKeys()) {
      if (k?.crypto_addresses?.[this.ticker]?.includes(user_id)) {
        return k.publicKey;
      }
    }

    return false;
  }

  async validateHistory() {
    await super.validateHistory();
    for (let i = 0; i < this.history.length; i++) {
      //
      // Retroactively check for Saito publickeys to display user names
      //
      if (this.history[i].counter_party.address && !this.history[i].counter_party.publicKey) {
        // We will save an empty string so we don't repeatedly hit the external DB for non-Saito linked accounts
        if (this.history[i].counter_party.publicKey !== '') {
          this.history[i].counter_party.publicKey =
            this.getSaitoPublicKey(this.history[i].counter_party.address) ||
            (await this.remoteUserFetch(this.history[i].counter_party.address));
        }
      }
    }
  }

  async remoteUserFetch(user_id) {
    let user = null;

    // It is very strange that we seem to be unable to pass values back from
    // this asynchronous function, though I swear there are places in the code where
    // we expect that behavior.
    // This setting a variable through the callback, with an await (to make sure the callback gets called)
    // seems to do the trick

    await this.mixin.sendFetchUserTransaction(
      {
        asset_id: this.asset_id,
        user_id
      },
      (res) => {
        if (res?.length > 0) {
          // Cache this results!
          let address = res[0].address;
          if (res[0]?.user_id) {
            address += '|' + res[0].user_id + '|mixin';
          }

          if (res[0].publickey) {
            let pk = res[0].publickey;
            this.cached_contacts[pk] = address;
            // save address to keychain if publickey exists in keychain
            if (this.app.keychain.hasPublicKey(pk)) {
              this.app.keychain.addCryptoAddress(pk, this.ticker, address);
            }
          }

          user = res[0];
        }
      }
    );
    return user?.publickey || '';
  }

  /**
   * Incremental history / snapshot sync: fetch new Safe ledger events, append to history,
   * emit semantic payment events, and advance history_update_ts.
   */
  async checkForRecentTransactions() {
    // We should not be making API calls on Mixin if we haven't installed this crypto
    // (let alone set up a mixin account)
    if (!this.isActivated()) {
      return [];
    }

    console.log('@@@ checkForRecentTransactions -- ' + this.ticker);

    let fetched_updates = [];

    if (!this.asset_id) {
      return [];
    }

    let snapshots = await new Promise((resolve) => {
      this.mixin.fetchSafeSnapshots(this.asset_id, this.history_update_ts + 1, (d) => {
        resolve(d === false || d == null ? [] : d);
      });
    });

    if (snapshots.length > 0) {
      // Real ledger activity arrived; allow fetchBalance and drop the synthetic
      // pending history row (details overlay uses last_balance until this point).
      delete this.last_balance_fetch;
      delete this.last_balance;
    }

    for (let snap of snapshots) {
      //
      // Snapshot object returned by Mixin Safe API (via mixin.js fetchSafeSnapshots):
      //
      // {
      //   snapshot_id: "6049b6c2-3f9e-3627-b671-c81f4f6a88fa",
      //   user_id: "95b8a0a4-1032-33e7-9154-5f48ebe00a14",
      //   opponent_id: "dac46e33-fdd2-3453-b77a-73ffadba1ff1",
      //   transaction_hash: "1db6dc53df33bfc7dd38afa86eb83454b5b71bc178da653431ddc9af025a7487",
      //   asset_id: "43d61dcd-e413-450d-80b8-101d5e903357",
      //   kernel_asset_id: "8dd50817c082cdcdd6f167514928767a4b52426997bd6d4930eca101c5ff8a27",
      //   amount: "0.005",
      //   memo: "746573742d6d656d6f",
      //   request_id: "bfb05bb6-03e5-4b5c-a7ab-2ad5a4ed56a7",
      //   created_at: "2025-08-25T03:23:17.657426Z",
      //   level: 11,
      //   type: "snapshot",
      //   inscription_hash: "INSCRIPTION-HASH",
      //   deposit: {
      //     deposit_hash: "DEPOSIT-HASH",
      //     deposit_index: 1,
      //     sender: "SOME-STRING",
      //     destination: "DEPOSIT-DESTINATION",
      //     tag: "DEPOSIT-TAG"
      //   },
      //   withdrawal: {
      //     withdrawal_hash: "WITHDRAWAL-HASH",
      //     receiver: "SOME-STRING"
      //   }
      // }
      //

      const obj = {
        snapshot_id: snap.snapshot_id,
        counter_party: { address: '' },
        timestamp: new Date(snap.created_at).getTime(),
        amount: Number(snap.amount),
        trans_hash: snap.transaction_hash || ''
      };

      if (obj.timestamp < this.history_update_ts) {
        continue;
      }

      if (snap.deposit) {
        //obj.type = 'deposit';
        obj.type = 'receive';
        obj.counter_party.address = snap.deposit.sender || '';
      } else if (snap.withdrawal) {
        //obj.type = 'withdraw';
        obj.type = 'send';
        obj.counter_party.address = snap.withdrawal.receiver || '';
      } else if (obj.amount > 0) {
        obj.type = 'receive';
      } else {
        obj.type = 'send';
      }

      if (snap?.opponent_id) {
        let pk = this.getSaitoPublicKey(snap.opponent_id);
        if (!pk) {
          pk = await this.remoteUserFetch(snap.opponent_id);
        }
        if (pk) {
          obj.counter_party.publicKey = pk;
        }
        obj.counter_party.address = await this.processAddress(snap.opponent_id, false);
      }

      this.history.push(obj);
      fetched_updates.push(obj);

      if (obj.type === 'deposit' || obj.type === 'receive') {
        this.app.connection.emit('on-payment-received', {
          ticker: this.ticker || '',
          amount: String(Math.abs(obj.amount)),
          receiver: this.publicKey,
          receiver_address: this.formatAddress() || '',
          sender_address: obj?.counter_party.address || 'unknown',
          sender: obj?.counter_party.publicKey || 'unknown',
          timestamp: obj.timestamp,
          transaction_signature: obj.trans_hash
          //memo: snap.memo || ''
        });
      } else if (obj.type === 'send' || obj.type === 'withdraw') {
        this.app.connection.emit('on-payment-sent', {
          ticker: this.ticker || '',
          amount: String(Math.abs(obj.amount)),
          receiver_address: obj?.counter_party.address || 'unknown',
          receiver: obj?.counter_party.publicKey || 'unknown',
          sender_address: this.formatAddress() || '',
          sender: this.publicKey,
          timestamp: obj.timestamp,
          transaction_signature: obj.trans_hash
          //memo: snap.memo || ''
        });
      }

      this.history_update_ts = Math.max(this.history_update_ts, obj.timestamp);
    }

    if (snapshots.length > 0) {
      this.save();
    }

    return fetched_updates;
  }

  stopPolling() {
    this.polling_active = 0;
    if (this.polling_timeout) {
      clearTimeout(this.polling_timeout);
      this.polling_timeout = null;
    }
  }

  startPolling() {
    //
    // if we are already polling, increase urgency by reducing interval index
    //
    if (this.polling_active) {
      if (this.polling_interval_current > 0) {
        this.polling_interval_current--;
      }
      return;
    }

    //
    // record that we are polling
    //
    this.polling_active = 1;
    this.polling_interval_current = 0;

    const poll = async () => {
      //
      // polling stopped externally
      //
      if (!this.polling_active) {
        return;
      }

      let wallet_updates = await this.checkForRecentTransactions();

      // We could also independently hit the API for pendingDeposits...

      //
      // if something has happened....
      // or nothing is going to happen...
      //
      if (
        wallet_updates?.length > 0 ||
        this.polling_interval_current >= this.polling_intervals.length
      ) {
        this.stopPolling();
        return;
      }

      //
      // schedule next poll
      //
      let delay = this.polling_intervals[this.polling_interval_current];

      this.polling_interval_current++;

      this.polling_timeout = setTimeout(poll, delay);
    };

    //
    // now start!
    //
    poll();

    return;
  }

  /**
   * Abstract method which should transfer tokens via the crypto endpoint
   * @abstract
   * @param {Number} howMuch - How much of the token to transfer
   * @param {String} to - Pubkey/address to send to
   * @abstract
   * @return {Number}
   */
  async sendPayment(amount = '', recipient = '', unique_hash = '') {
    let internal_transfer = false;
    let destination = await this.processAddress(recipient);

    let r = destination.split('|');

    let res = {};

    console.info('Mixin sendPayment to ' + destination);

    //
    // if address has |mixin| concat --> internal mixin transfer
    //
    if (r.length >= 2) {
      if (r[2] === 'mixin') {
        res = await this.mixin.sendInNetworkTransferRequest(this.asset_id, r[1], amount);
      }
    } else if (this.validateAddress(destination)) {
      //
      // address is external, send external withdrawl request
      //
      res = await this.mixin.sendExternalNetworkTransferRequest(this.asset_id, destination, amount);
    } else {
      throw new Error(`MixinModule: invalid address for ${this.ticker} -- `, destination);
    }

    if (res.status == 200) {
      // Safe UTXO balance lags after send; cache expected post-send balance and
      // pre-send snapshot until fetchBalance / checkForRecentTransactions confirm.
      this.pending_balance = Number(res.pending.toFixed(8));
      if (!this.last_balance) {
        this.last_balance = this.balance;
      }

      if (res.message?.length) {
        return res.message[0].transaction_hash || unique_hash;
      }
      return unique_hash;
    } else {
      throw new Error('MixinModule: ' + res.message);
      return '';
    }
  }

  //
  // Reference for how we used to package the mixin address bar...
  //
  formatAddress() {
    return this.address + '|' + this.mixin.mixin.user_id + '|' + 'mixin';
  }

  /**
   * Abstract method which should get private key
   * @abstract
   * @return {String} Private Key
   */
  returnPrivateKey() {
    return this.mixin.mixin.privatekey;
  }

  async returnMixinNetworkInfo() {
    let info = await this.mixin.returnMixinNetworkInfo(this.asset_id);
    this.confirmations = info.confirmations || 0;
    this.price_usd = Number(info.price_usd);
    this.last_update = Date.now();
    this.icon_url = info.icon_url;
    return info;
  }

  //
  // this function creates a Mixin address associated with the account in order to check
  // if it can offer zero-fee in-network transfers or requires a network fee to be paid
  // in order to process the payment.
  //
  async checkWithdrawalFeeForAddress(address = '', mycallback) {
    if (address == '') {
      return mycallback(0);
    }

    address = await this.processAddress(address);

    let r = address.split('|');
    let ts = new Date().getTime();

    //
    // internal MIXIN transfer, 0 fee
    //
    if (r.length >= 2) {
      if (r[2] === 'mixin') {
        return mycallback(0);
      }
    } else {
      let fee = await this.mixin.returnWithdrawalFee(this.asset_id, address);
      if (fee !== false) {
        return mycallback(fee);
      }

      return mycallback(0);
    }
  }

  /**
   * Abstract method which returns snapshot of asset withdrawls, deposits
   * @abstract
   * @return {Function} Callback function
   */
  async fetchHistory(ts = null, mycallback = null) {
    const newTransactions = await this.checkForRecentTransactions();

    if (mycallback != null) {
      mycallback(this.history);
    }
  }

  async returnUtxo(state = 'unspent', limit = 500, order = 'DESC', callback = null) {
    return await this.mixin.fetchUtxo(state, limit, order, callback);
  }

  async returnAddressFromPublicKey(publicKey) {
    this_self = this;
    try {
      //try local cache first
      if (this.cached_contacts[publicKey]) {
        return this.cached_contacts[publicKey];
      }

      let key = this.app.keychain.returnKey(publicKey, true);

      if (key?.crypto_addresses) {
        return key.crypto_addresses[this.ticker];
      }

      // if it doesnt exist fetch it from node db
      let address = '';
      await this.mixin.sendFetchUserTransaction(
        {
          publicKey: publicKey,
          asset_id: this.asset_id
        },
        function (res) {
          if (res.length > 0) {
            for (let i = 0; i < res.length; i++) {
              if (res[i].asset_id == this_self.asset_id) {
                address = res[i].address;
                if (res[i]?.user_id) {
                  address += '|' + res[i].user_id + '|mixin';
                }

                this_self.cached_contacts[publicKey] = address;
                // save address to keychain if publickey exists in keychain
                if (this_self.app.keychain.hasPublicKey(publicKey)) {
                  this_self.app.keychain.addCryptoAddress(publicKey, this_self.ticker, address);
                }
                return address;
              }
            }
          }
        }
      );

      return address;
    } catch (err) {
      // console.error('Error getMixinAddress: ', err);
      return null;
    }
  }

  /**
   * Mixin specific function to minimize the amount of table look ups
   * @destination (string) the chain address for the token -- no validation (?)
   * @remote_fallback (boolean) -- we are overloading this function to also function as a
   * 								search through our cache and keychain to get the full formatted address from
   * 								the mixin_id...
   */
  async processAddress(destination, remote_fallback = true) {
    if (destination.includes('|mixin')) {
      return destination;
    }

    if (this.app.crypto.isPublicKey(destination)) {
      return await this.returnAddressFromPublicKey(destination);
    } else {
      //
      // check if address exists in local db
      //
      for (let pk in this.cached_contacts) {
        if (this.cached_contacts[pk].includes(destination)) {
          return this.cached_contacts[pk];
        }
      }

      for (let k of this.app.keychain.returnKeys()) {
        if (k?.crypto_addresses?.[this.ticker]?.includes(destination)) {
          return k.crypto_addresses[this.ticker];
        }
      }

      if (remote_fallback) {
        //
        // check if address exists in remote db
        //
        await this.mixin.sendFetchUserTransaction(
          {
            address: destination,
            asset_id: this.asset_id
          },
          (res) => {
            if (res?.length) {
              let user_data = res[0];
              if (user_data?.publickey && user_data.user_id) {
                destination += '|' + user_data.user_id + '|mixin';
                // Cache return values
                this.cached_contacts[user_data.publickey] = destination;
                if (this.app.keychain.hasPublicKey(user_data.publickey)) {
                  this.app.keychain.addCryptoAddress(user_data.publickey, this.ticker, destination);
                }
              }
            }
          }
        );
      }

      return destination;
    }
  }

  validateAddress(address) {
    if (address.includes('|')) {
      let r = address.split('|');
      address = r[0];
    }

    try {
      return WAValidator.validate(address, this.ticker);
    } catch (err) {
      console.error("Error 'validateAddress' MixinModule: ", err);
      return false;
    }
  }
}

module.exports = MixinModule;
