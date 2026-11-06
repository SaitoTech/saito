const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const IdentityTemplate = require('./identity.template');

class IdentityPrompt {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
  }

  render(name, hooks = {}) {
    this.hooks = hooks;
    this.overlay.show(IdentityTemplate(name), () => {
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    const form = document.querySelector('.saitosign-identity');
    if (!form) {
      return;
    }
    form.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-identity]');
      if (!choice) {
        return;
      }
      event.preventDefault();
      const yes = choice.dataset.identity === 'yes';
      this.overlay.close();
      if (yes && this.hooks.onYes) {
        this.hooks.onYes();
      }
    });
  }
}

module.exports = IdentityPrompt;
