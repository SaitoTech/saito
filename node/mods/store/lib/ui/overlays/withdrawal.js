const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const WithdrawalTemplate = require('./withdrawal.template');

class WithdrawalOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render({ ticker = '', available = '0' } = {}) {
    this.overlay.show(WithdrawalTemplate({ ticker, available }));
    const root = document.querySelector('.store-withdrawal');
    root?.querySelector('[data-action="cancel"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.overlay.close();
    });
    root?.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }
}

module.exports = WithdrawalOverlay;
