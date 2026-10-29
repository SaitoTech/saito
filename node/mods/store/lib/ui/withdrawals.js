const WithdrawalsTemplate = require('./withdrawals.template');
const WithdrawalOverlay = require('./overlays/withdrawal');
const { decimalIsPositive } = require('../web3-amount');
const {
  returnStoreWeb3Tickers,
  requestStoreWeb3Tickers
} = require('./overlays/listing-field-edit');

class WithdrawalsView {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new WithdrawalOverlay(app, mod);
    this.balances = {};

    this.app.connection.on('saito-purchase-cryptos', () => {
      if (!this.isVisible()) {
        return;
      }
      this.render(this.container, { requestTickers: false });
    });
  }

  isVisible() {
    if (!this.container) {
      return false;
    }
    const panel = document.querySelector(this.container);
    return !!panel?.classList.contains('is-active');
  }

  returnRows() {
    return returnStoreWeb3Tickers(this.app)
      .filter((ticker) => ticker !== 'SAITO')
      .map((ticker) => {
        const balance = this.balances[ticker] || {};
        return {
          ticker,
          eligible: balance.eligible || 0,
          pending: balance.pending || 0
        };
      });
  }

  applyBalances(response = {}) {
    const pending = response?.pending && typeof response.pending === 'object' ? response.pending : {};
    const eligible =
      response?.eligible && typeof response.eligible === 'object' ? response.eligible : {};
    const balances = {};
    for (const [ticker, amount] of Object.entries({ ...pending, ...eligible })) {
      const symbol = String(ticker || '').trim().toUpperCase();
      if (!symbol || symbol === 'SAITO') {
        continue;
      }
      if (!balances[symbol]) {
        balances[symbol] = { pending: 0, eligible: 0 };
      }
    }
    for (const [ticker, amount] of Object.entries(pending)) {
      const symbol = String(ticker || '').trim().toUpperCase();
      if (!balances[symbol]) {
        continue;
      }
      balances[symbol].pending = amount;
    }
    for (const [ticker, amount] of Object.entries(eligible)) {
      const symbol = String(ticker || '').trim().toUpperCase();
      if (!balances[symbol]) {
        continue;
      }
      balances[symbol].eligible = amount;
    }
    this.balances = balances;
  }

  loadBalances() {
    const peerKey = this.mod.store_public_key;
    if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
      this.balances = {};
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.app.network.sendRequestAsTransaction(
        'load-web3-proceeds',
        { module: 'Store' },
        (response) => {
          this.applyBalances(response || {});
          resolve();
        },
        peerKey
      );
    });
  }

  render(container = '', options = {}) {
    if (container) {
      this.container = container;
    }
    if (!this.container) {
      return;
    }

    if (options.requestTickers !== false) {
      requestStoreWeb3Tickers(this.app);
    }
    this.app.browser.replaceElementContentBySelector(
      WithdrawalsTemplate({ rows: this.returnRows() }),
      this.container
    );
    this.attachEvents();
  }

  async show() {
    await this.loadBalances();
    this.render();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    root.querySelectorAll('[data-action="withdraw"]').forEach((link) => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const ticker = link.getAttribute('data-ticker') || '';
        await this.loadBalances();
        this.render(this.container, { requestTickers: false });
        const row = this.returnRows().find((item) => item.ticker === ticker);
        if (!row || !decimalIsPositive(row.eligible)) {
          return;
        }
        this.overlay.open(ticker);
      });
    });
  }
}

module.exports = WithdrawalsView;
