const WithdrawalsTemplate = require('./withdrawals.template');
const WithdrawalOverlay = require('./overlays/withdrawal');
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
    // Per-ticker balances. available > 0 shows the withdraw link.
    // pending_on is the timestamp when that pending amount clears one genesis period.
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
          available: Number(balance.available) || 0,
          pending: Number(balance.pending) || 0,
          pending_on: balance.pending_on || 0
        };
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

  show() {
    this.render();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    root.querySelectorAll('[data-action="withdraw"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const ticker = link.getAttribute('data-ticker') || '';
        const row = this.returnRows().find((item) => item.ticker === ticker);
        if (!row || !(Number(row.available) > 0)) {
          return;
        }
        this.overlay.render({
          ticker,
          available: String(row.available)
        });
      });
    });
  }
}

module.exports = WithdrawalsView;
