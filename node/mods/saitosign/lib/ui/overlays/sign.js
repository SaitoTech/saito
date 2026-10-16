const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SignTemplate = require('./sign.template');

class SignOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
    this.busy = false;
  }

  render(view, hooks = {}) {
    this.hooks = hooks;
    this.busy = false;
    this.overlay.show(SignTemplate(view), () => {
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    const form = document.querySelector('.saitosign-sign');
    if (!form) {
      return;
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.busy) {
        return;
      }
      this.busy = true;
      Promise.resolve(this.hooks.onSign ? this.hooks.onSign() : false)
        .then((saved) => {
          if (!saved) {
            this.busy = false;
          }
        })
        .catch(() => {
          this.busy = false;
        });
    });
  }

  close() {
    this.overlay.close();
  }
}

module.exports = SignOverlay;
