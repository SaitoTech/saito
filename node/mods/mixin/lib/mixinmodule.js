const CryptoModule = require('./../../../lib/templates/cryptomodule');
const WAValidator = require('@taasfi/multicoin-address-validator');
const Decimal = require('decimal.js');

class MixinModule extends CryptoModule {
  constructor(app, mixinMod, ticker, assetId, chainId) {
    super(app, ticker);

    this.mixin = mixinMod;
    this.asset_id = assetId;
    this.chain_id = chainId;
    this.polling_active = 0;
    this.polling_timeout = 0;
    this.polling_intervals = [5000, 15000, 45000, 90000, 120000, 180000];
    this.polling_interval_current = 0;
    this.cached_contacts = [];
    this.confirmations = 100;
  }

  async activate() {
    try {
      if (!this.mixin.account_created) {
        console.info('Create Mixin account');
        const result = await this.mixin.createAccount();
        if (result?.err || !this.mixin.account_created) {
          throw new Error(result?.err || 'Mixin account was not created');
        }
      }

      if (!this.address) {
        console.info(`Create Mixin deposit address -- ${this.ticker}`);
        const address = await this.mixin.accounts.createAddress(this.asset_id, this.chain_id);
        if (!address) {
          throw new Error('Mixin deposit address was not created');
        }
        this.address = address;
        this.save();
        console.info(`Address for ${this.ticker}: ${this.address}`);
      }

      await super.activate();
      return true;
    } catch (err) {
      console.error(`Unable to activate ${this.ticker}:`, err);
      if (this.app.BROWSER) {
        salert(`Having problem generating key for ${this.ticker}`);
      }
      await this.app.wallet.setPreferredCrypto('SAITO');
      return false;
    }
  }

  async loadHistory() {
    await super.loadHistory();
    await this.fetchHistory();
  }

  async fetchBalance() {
    if (!this.address) {
      console.info('Mixin Error: no address - terminating fetch balance');
      return;
    }

    const ts = Date.now();
    if (!this.last_balance_fetch || ts - this.last_balance_fetch > 10000) {
      console.log('@@@ FetchBalance ' + this.ticker);
      this.last_balance_fetch = ts;

      const balance = await this.mixin.api.fetchBalance(
        this.mixin.accounts.getCredentials(),
        this.asset_id
      );
      if (balance !== false) {
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

  async getPendingBalance() {
    let pendingBalance = Number(await this.getAvailableBalance());

    if (this.pending_balance) {
      if (pendingBalance !== this.pending_balance) {
        pendingBalance = this.pending_balance;
      }
    }

    this.pending_deposits = await this.fetchPendingDeposits();

    for (const deposit of this.pending_deposits) {
      if (
        deposit.state === 'pending' ||
        Number(deposit.confirmations) < Number(this.confirmations)
      ) {
        pendingBalance += Number(deposit.amount || 0);
      }
    }

    return pendingBalance.toString() || '0';
  }

  async fetchPendingDeposits(callback = null) {
    if (!this.address) {
      this.pending_deposits = [];
      if (callback) {
        callback([]);
      }
      return [];
    }

    const deposits = await this.mixin.api.fetchDeposits(
      this.mixin.accounts.getCredentials(),
      this.asset_id,
      this.address
    );
    this.pending_deposits = deposits === false ? this.pending_deposits || [] : deposits || [];

    if (callback) {
      callback(this.pending_deposits);
    }

    return this.pending_deposits;
  }

  getSaitoPublicKey(userId) {
    for (const publicKey in this.cached_contacts) {
      if (this.cached_contacts[publicKey].includes(userId)) {
        return publicKey;
      }
    }

    for (const key of this.app.keychain.returnKeys()) {
      if (key?.crypto_addresses?.[this.ticker]?.includes(userId)) {
        return key.publicKey;
      }
    }

    return false;
  }

  async validateHistory() {
    await super.validateHistory();
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].counter_party.address && !this.history[i].counter_party.publicKey) {
        if (this.history[i].counter_party.publicKey !== '') {
          this.history[i].counter_party.publicKey =
            this.getSaitoPublicKey(this.history[i].counter_party.address) ||
            (await this.lookupPublicKey(this.history[i].counter_party.address));
        }
      }
    }
  }

  async lookupPublicKey(userId) {
    const row = await this.mixin.fetchMixinUser({
      asset_id: this.asset_id,
      user_id: userId
    });
    if (!row) {
      return '';
    }

    let address = row.address || '';
    if (row.user_id) {
      address += '|' + row.user_id + '|mixin';
    }
    if (row.publickey) {
      this.cached_contacts[row.publickey] = address;
      if (this.app.keychain.hasPublicKey(row.publickey)) {
        this.app.keychain.addCryptoAddress(row.publickey, this.ticker, address);
      }
    }
    return row.publickey || '';
  }

  mixinUserId(address) {
    const parts = String(address || '')
      .trim()
      .split('|');
    if (parts.length >= 3 && parts[parts.length - 1].toLowerCase() === 'mixin') {
      return parts[parts.length - 2].toLowerCase() || null;
    }
    return null;
  }

  paymentsHaveSameSender(expectedSender, actualSender) {
    if (super.paymentsHaveSameSender(expectedSender, actualSender)) {
      return true;
    }

    const expectedId =
      this.mixinUserId(expectedSender) ||
      String(expectedSender || '')
        .trim()
        .toLowerCase();
    const actualId =
      this.mixinUserId(actualSender) ||
      String(actualSender || '')
        .trim()
        .toLowerCase();
    return Boolean(expectedId && actualId && expectedId === actualId);
  }

  async fetchHistory(since = null, callback = null) {
    if (!this.isActivated()) {
      if (callback) {
        callback(this.history);
      }
      return [];
    }

    console.log('@@@ fetchHistory -- ' + this.ticker);

    if (!this.asset_id) {
      if (callback) {
        callback(this.history);
      }
      return [];
    }

    const cursor = since > 0 ? since : this.history_update_ts + 1;
    const snapshots = await this.mixin.api.fetchHistory(
      this.mixin.accounts.getCredentials(),
      this.asset_id,
      cursor
    );
    const events = snapshots === false || snapshots == null ? [] : snapshots;

    if (events.length > 0) {
      delete this.last_balance_fetch;
      delete this.last_balance;
    }

    const fetched = [];
    for (const snap of events) {
      const entry = {
        snapshot_id: snap.snapshot_id,
        counter_party: { address: '' },
        timestamp: new Date(snap.created_at).getTime(),
        amount: Number(snap.amount),
        trans_hash: snap.transaction_hash || ''
      };

      if (entry.timestamp < this.history_update_ts) {
        continue;
      }

      if (snap.deposit) {
        entry.type = 'receive';
        entry.counter_party.address = snap.deposit.sender || '';
      } else if (snap.withdrawal) {
        entry.type = 'send';
        entry.counter_party.address = snap.withdrawal.receiver || '';
      } else if (entry.amount > 0) {
        entry.type = 'receive';
      } else {
        entry.type = 'send';
      }

      if (snap?.opponent_id) {
        let publicKey = this.getSaitoPublicKey(snap.opponent_id);
        if (!publicKey) {
          publicKey = await this.lookupPublicKey(snap.opponent_id);
        }
        if (publicKey) {
          entry.counter_party.publicKey = publicKey;
        }
        entry.counter_party.address = await this.processAddress(snap.opponent_id, false);
      }

      this.history.push(entry);
      fetched.push(entry);

      if (entry.type === 'receive') {
        this.app.connection.emit('on-payment-received', {
          ticker: this.ticker || '',
          amount: String(Math.abs(entry.amount)),
          receiver: this.publicKey,
          receiver_address: this.formatAddress() || '',
          sender_address: entry?.counter_party.address || 'unknown',
          sender: entry?.counter_party.publicKey || 'unknown',
          timestamp: entry.timestamp,
          transaction_signature: entry.trans_hash
        });
      } else if (entry.type === 'send') {
        this.app.connection.emit('on-payment-sent', {
          ticker: this.ticker || '',
          amount: String(Math.abs(entry.amount)),
          receiver_address: entry?.counter_party.address || 'unknown',
          receiver: entry?.counter_party.publicKey || 'unknown',
          sender_address: this.formatAddress() || '',
          sender: this.publicKey,
          timestamp: entry.timestamp,
          transaction_signature: entry.trans_hash
        });
      }

      this.history_update_ts = Math.max(this.history_update_ts, entry.timestamp);
    }

    if (events.length > 0) {
      this.save();
    }

    if (callback) {
      callback(this.history);
    }

    return fetched;
  }

  stopPolling() {
    this.polling_active = 0;
    if (this.polling_timeout) {
      clearTimeout(this.polling_timeout);
      this.polling_timeout = null;
    }
  }

  startPolling() {
    if (this.polling_active) {
      if (this.polling_interval_current > 0) {
        this.polling_interval_current--;
      }
      return;
    }

    this.polling_active = 1;
    this.polling_interval_current = 0;

    const poll = async () => {
      if (!this.polling_active) {
        return;
      }

      const walletUpdates = await this.fetchHistory();
      const stillWaiting = Object.keys(this.transfers_inbound).length > 0;
      if (
        (walletUpdates?.length > 0 && !stillWaiting) ||
        this.polling_interval_current >= this.polling_intervals.length
      ) {
        this.stopPolling();
        return;
      }

      const delay = this.polling_intervals[this.polling_interval_current];
      this.polling_interval_current++;
      this.polling_timeout = setTimeout(poll, delay);
    };

    poll();
  }

  async sendPayment(amount = '', recipient = '', uniqueHash = '', memo = '') {
    const address = await this.processAddress(recipient);
    if (!address) {
      throw new Error(`MixinModule: invalid address for ${this.ticker} -- ${recipient}`);
    }

    const parts = address.split('|');
    const credentials = this.mixin.accounts.getCredentials();

    let sent;
    try {
      if (parts.length >= 3 && parts[2] === 'mixin') {
        sent = await this.mixin.api.sendToUser(credentials, this.asset_id, parts[1], amount, memo);
      } else if (this.validateAddress(address)) {
        sent = await this.mixin.api.sendToAddress(credentials, this.asset_id, address, amount, memo);
      } else {
        throw new Error(`invalid address for ${this.ticker} -- ${address}`);
      }
    } catch (err) {
      throw new Error(
        'MixinModule: ' + (err instanceof Error ? err.message : err || 'payment failed')
      );
    }

    if (Number.isFinite(sent.pendingBalance)) {
      this.pending_balance = sent.pendingBalance;
    } else if (this.balance != null && this.balance !== '') {
      this.pending_balance = Number(new Decimal(this.balance).minus(amount).toFixed(8));
    }
    if (!this.last_balance) {
      this.last_balance = this.balance;
    }

    return sent.hash || uniqueHash;
  }

  formatAddress() {
    const userId =
      this.mixin.credentials?.user_id || this.mixin.accounts.getCredentials().user_id || '';
    return this.address + '|' + userId + '|' + 'mixin';
  }

  returnPrivateKey() {
    return this.mixin.accounts.getCredentials().spend_private_key;
  }

  async returnMixinNetworkInfo() {
    const info = await this.mixin.api.fetchAsset(
      this.mixin.accounts.getCredentials(),
      this.asset_id
    );
    if (!info) {
      return false;
    }
    this.confirmations = info.confirmations || 0;
    this.price_usd = Number(info.price_usd);
    this.last_update = Date.now();
    this.icon_url = info.icon_url;
    return info;
  }

  async checkWithdrawalFeeForAddress(address = '', callback) {
    if (address == '') {
      return callback(0);
    }

    address = await this.processAddress(address);
    const parts = String(address || '').split('|');

    if (parts.length >= 3 && parts[2] === 'mixin') {
      return callback(0);
    }

    const fee = await this.mixin.api.fetchWithdrawalFee(
      this.mixin.accounts.getCredentials(),
      this.asset_id,
      address
    );
    if (fee !== false) {
      const feeBalance = await this.mixin.api.fetchBalance(
        this.mixin.accounts.getCredentials(),
        fee.asset_id
      );
      const feeModule = this.mixin.crypto_mods?.find(
        (cryptoModule) => cryptoModule.asset_id === fee.asset_id
      );
      return callback(fee.amount, {
        ...fee,
        ticker: feeModule?.ticker || fee.ticker,
        available_balance: feeBalance === false ? null : feeBalance
      });
    }

    return callback(0);
  }

  async returnAddressFromPublicKey(publicKey) {
    try {
      if (this.cached_contacts[publicKey]) {
        return this.cached_contacts[publicKey];
      }

      const key = this.app.keychain.returnKey(publicKey, true);
      if (key?.crypto_addresses) {
        return key.crypto_addresses[this.ticker];
      }

      const row = await this.mixin.fetchMixinUser({
        publicKey,
        asset_id: this.asset_id
      });
      if (!row || row.asset_id !== this.asset_id) {
        return '';
      }

      let address = row.address;
      if (row.user_id) {
        address += '|' + row.user_id + '|mixin';
      }
      this.cached_contacts[publicKey] = address;
      if (this.app.keychain.hasPublicKey(publicKey)) {
        this.app.keychain.addCryptoAddress(publicKey, this.ticker, address);
      }
      return address;
    } catch (err) {
      return null;
    }
  }

  async processAddress(recipient, remoteFallback = true) {
    if (!recipient) {
      return recipient;
    }

    let address = String(recipient);
    if (address.includes('|mixin')) {
      return address;
    }

    if (this.app.crypto.isPublicKey(address)) {
      return await this.returnAddressFromPublicKey(address);
    }

    for (const publicKey in this.cached_contacts) {
      if (this.cached_contacts[publicKey].includes(address)) {
        return this.cached_contacts[publicKey];
      }
    }

    for (const key of this.app.keychain.returnKeys()) {
      if (key?.crypto_addresses?.[this.ticker]?.includes(address)) {
        return key.crypto_addresses[this.ticker];
      }
    }

    if (remoteFallback) {
      const row = await this.mixin.fetchMixinUser({
        address,
        asset_id: this.asset_id
      });
      if (row?.publickey && row.user_id) {
        address += '|' + row.user_id + '|mixin';
        this.cached_contacts[row.publickey] = address;
        if (this.app.keychain.hasPublicKey(row.publickey)) {
          this.app.keychain.addCryptoAddress(row.publickey, this.ticker, address);
        }
      }
    }

    return address;
  }

  validateAddress(address) {
    if (String(address).includes('|')) {
      address = String(address).split('|')[0];
    }

    try {
      const chain = this.mixin?.crypto_mods?.find(
        (cryptoModule) => cryptoModule.asset_id === this.chain_id
      );
      return WAValidator.validate(address, chain?.ticker || this.ticker);
    } catch (err) {
      console.error("Error 'validateAddress' MixinModule: ", err);
      return false;
    }
  }
}

module.exports = MixinModule;
