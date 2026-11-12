const SaitoOverlay = require('../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const NonCardConfirmTemplate = require('./non-card-confirm.template');

class NonCardConfirm {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.on_confirm = null;
    this.on_cancel = null;
  }

  render() {
    this.overlay.show(NonCardConfirmTemplate());
    const root = document.querySelector('.tscardgen-non-card-confirm');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="confirm"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.overlay.remove();
      if (typeof this.on_confirm === 'function') {
        this.on_confirm();
      }
    });

    root.querySelector('[data-action="cancel"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.overlay.remove();
      if (typeof this.on_cancel === 'function') {
        this.on_cancel();
      }
    });
  }
}

module.exports = NonCardConfirm;
