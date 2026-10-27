const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const WithdrawalTemplate = require('./withdrawal.template');
const { decimalIsPositive } = require('../../web3-amount');
const { SUPPORT_EMAIL, SUPPORT_URL } = require('../../withdrawal');

class WithdrawalOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.ticker = '';
    this.eligible = '0';
    this.error = '';
    this.message = '';
    this.quote = null;
    this.prepared = null;
    this.statusText = 'Preparing your TRX withdrawal request.';
    this.submitting = false;
  }

  localAccount(ticker = this.ticker) {
    const crypto = this.app.wallet?.returnCryptoModuleByTicker?.(ticker);
    const activated = !!(
      crypto &&
      (crypto.isActivated?.() || crypto.options?.isActivated || crypto.address)
    );
    return {
      crypto,
      activated,
      address: String(crypto?.address || '')
    };
  }

  loadEligibleAmount(ticker = this.ticker) {
    const peerKey = this.mod.store_public_key;
    if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
      return Promise.resolve('0');
    }
    return new Promise((resolve) => {
      this.app.network.sendRequestAsTransaction(
        'load-web3-proceeds',
        { module: 'Store' },
        (response) => {
          const amount = response?.eligible?.[ticker];
          resolve(decimalIsPositive(amount) ? String(amount) : '0');
        },
        peerKey
      );
    });
  }

  show(state, extra = {}) {
    this.overlay.show(
      WithdrawalTemplate({
        state,
        ticker: this.ticker,
        eligible: this.eligible,
        error: this.error,
        message: this.message,
        statusText: this.statusText,
        supportEmail: SUPPORT_EMAIL,
        supportUrl: SUPPORT_URL,
        ...extra
      })
    );
    this.attachEvents();
  }

  async open(ticker = '') {
    this.ticker = String(ticker || '').trim().toUpperCase();
    this.error = '';
    this.eligible = '0';
    this.statusText = `Preparing your ${this.ticker} withdrawal request.`;
    this.submitting = false;
    this.show('loading');
    await this.refresh();
  }

  async refresh() {
    this.eligible = await this.loadEligibleAmount(this.ticker);
    if (!decimalIsPositive(this.eligible)) {
      this.show('ineligible');
      return;
    }
    const account = this.localAccount();
    if (!account.activated || !account.address) {
      this.show('activate');
      return;
    }
    this.show('ready', { address: account.address });
  }

  async activateAccount() {
    const account = this.localAccount();
    if (typeof account.crypto?.activate !== 'function') {
      this.error = `A local ${this.ticker} account is not available in this wallet.`;
      this.show('activate');
      return;
    }
    this.error = '';
    this.statusText = `Preparing your ${this.ticker} withdrawal request.`;
    this.show('loading');
    let activated = false;
    try {
      activated = await account.crypto.activate();
    } catch (err) {
      activated = false;
    }
    const address = String(account.crypto.address || '');
    if (!activated || !address) {
      this.error = `Could not create a local ${this.ticker} account.`;
      this.show('activate');
      return;
    }
    await this.refresh();
  }

  requestFromStore(request, data) {
    const peerKey = this.mod.store_public_key;
    if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
      return Promise.resolve({ err: 'Store is not connected.' });
    }
    return new Promise((resolve) => {
      this.app.network.sendRequestAsTransaction(request, data, (response) => resolve(response || {}), peerKey);
    });
  }

  async requestQuote() {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    try {
      await this.prepareAndSubmit();
    } finally {
      this.submitting = false;
    }
  }

  async prepareAndSubmit() {
    const account = this.localAccount();
    this.error = '';
    this.message = '';
    this.quote = null;
    this.prepared = null;
    this.statusText = 'Retrieving withdrawal details...';
    this.show('quoting');
    const quote = await this.requestFromStore('store-withdrawal-quote', {
      module: 'Store',
      ticker: this.ticker,
      withdrawal_address: account.address
    });
    if (quote?.err || !quote?.data || !quote?.signature) {
      this.error = quote?.err || 'The Store could not prepare a withdrawal quote.';
      this.show('failed');
      return;
    }
    const required = BigInt(this.app.wallet.convertSaitoToNolan(quote.data.amount) ?? 0);
    let balance = 0n;
    try {
      balance = BigInt(await this.app.wallet.getBalance());
    } catch (err) {
      balance = 0n;
    }
    if (balance < required) {
      this.show('insufficient');
      return;
    }
    let prepared = null;
    try {
      prepared = await this.app.wallet.createUnsignedTransactionWithDefaultFee(quote.data.publickey, required);
    } catch (err) {
      const text = err?.message || String(err || '');
      if (text.toLowerCase().includes('insufficient')) {
        this.show('insufficient');
        return;
      }
      this.error = text || 'The withdrawal transaction could not be prepared.';
      this.show('failed');
      return;
    }
    const outputs = (prepared?.to || []).reduce((sum, slip) => {
      try {
        return sum + BigInt(slip?.amount ?? 0);
      } catch (err) {
        return sum;
      }
    }, 0n);
    if (!prepared || balance < outputs) {
      this.prepared = null;
      this.show('insufficient');
      return;
    }
    prepared.msg = {
      module: 'Store',
      request: 'store-withdrawal',
      data: quote.data,
      signature: quote.signature
    };
    this.quote = quote;
    this.prepared = prepared;
    await this.signAndSubmit();
  }

  async signAndSubmit() {
    if (!this.prepared || typeof this.prepared.sign !== 'function') {
      this.error = 'The withdrawal request is not ready to sign.';
      this.show('failed');
      return;
    }
    this.statusText = 'Signing your Saito transaction...';
    this.show('signing');
    try {
      await this.prepared.sign();
    } catch (err) {
      this.error = err?.message || 'The withdrawal transaction was not signed.';
      this.show('failed');
      return;
    }
    const serialized =
      typeof this.prepared.serialize_to_web === 'function'
        ? this.prepared.serialize_to_web(this.app)
        : '';
    this.statusText = 'Submitting your withdrawal request...';
    this.show('submitting');
    const result = await this.requestFromStore('store-withdrawal', {
      module: 'Store',
      transaction: serialized || this.prepared
    });
    if (!result || (result.status == null && result.err == null && result.message == null)) {
      this.error = 'The Store did not confirm this request. It was not submitted again.';
      this.show('failed');
      return;
    }
    if (result?.status === 'submitted') {
      this.message = result.message || 'Withdrawal request submitted.';
      this.show('submitted');
      return;
    }
    if (result?.status === 'accepted') {
      this.message = result.message || 'Withdrawal request accepted by the Store. The external cryptocurrency has not been sent.';
      this.show('accepted');
      return;
    }
    this.error = result?.err || result?.message || 'The withdrawal request was not accepted.';
    this.message = result?.message || '';
    this.show('failed');
  }

  attachEvents() {
    const root = document.querySelector('.store-withdrawal');
    if (!root) {
      return;
    }
    root.querySelector('[data-action="activate-account"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      return this.activateAccount();
    });
    root.querySelector('[data-action="confirm-withdraw"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      return this.requestQuote();
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }
}

module.exports = WithdrawalOverlay;
