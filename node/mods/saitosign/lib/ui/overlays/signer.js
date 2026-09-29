const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SignerTemplate = require('./signer.template');

class SignerOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay saitosign-user-overlay';
    this.hooks = {};
  }

  render(view, hooks = {}) {
    this.hooks = hooks;
    this.overlay.show(SignerTemplate(view), () => {
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    this.attachEvents();
  }

  close() {
    this.overlay.close();
  }

  attachEvents() {
    const remove = document.querySelector('[data-remove-signer-confirm]');
    if (remove) {
      remove.onclick = () => {
        if (this.hooks.onRemove) {
          this.hooks.onRemove();
        }
      };
    }

    const update = document.querySelector('[data-update-user]');
    if (update) {
      update.onclick = () => {
        const nameInput = document.querySelector('[data-user-name]');
        const emailInput = document.querySelector('[data-user-email]');
        if (!nameInput || !emailInput || !this.hooks.onUpdate) {
          return;
        }
        this.hooks.onUpdate({
          name: nameInput.value.trim(),
          email: emailInput.value.trim()
        });
      };
    }
  }
}

module.exports = SignerOverlay;
