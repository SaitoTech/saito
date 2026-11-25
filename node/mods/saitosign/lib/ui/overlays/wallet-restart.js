const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const WalletRestartTemplate = require('./wallet-restart.template');

class WalletRestartPrompt {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
  }

  render(name, hooks = {}) {
    this.hooks = hooks;
    this.chosen = false;
    this.overlay.show(WalletRestartTemplate(name), () => {
      if (!this.chosen && this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    const form = document.querySelector('.saitosign-identity');
    if (!form) {
      return;
    }
    form.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-wallet-restart]');
      if (!choice) {
        return;
      }
      event.preventDefault();
      const yes = choice.dataset.walletRestart === 'yes';
      this.chosen = true;
      this.overlay.close();
      if (yes && this.hooks.onYes) {
        this.hooks.onYes();
      }
      if (!yes && this.hooks.onNo) {
        this.hooks.onNo();
      }
    });
  }
}

module.exports = WalletRestartPrompt;
