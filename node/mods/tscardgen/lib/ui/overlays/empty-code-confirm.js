const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const EmptyCodeConfirmTemplate = require('./empty-code-confirm.template');

class EmptyCodeConfirm {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.on_add_code = null;
    this.on_create_without_code = null;
  }

  render() {
    this.overlay.show(EmptyCodeConfirmTemplate());
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.tscardgen-empty-code');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="add-code"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.overlay.remove();
      if (typeof this.on_add_code === 'function') {
        this.on_add_code();
      }
    });

    root
      .querySelector('[data-action="create-without-code"]')
      ?.addEventListener('click', (event) => {
        event.preventDefault();
        this.overlay.remove();
        if (typeof this.on_create_without_code === 'function') {
          this.on_create_without_code();
        }
      });
  }
}

module.exports = EmptyCodeConfirm;
