const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublicKeyFieldTemplate = require('./publickey.template');

class PublicKeyFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    this.overlay.show(PublicKeyFieldTemplate(this.path, this.currentValue));
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rustscript-field');
    if (!root) {
      return;
    }

    const input = root.querySelector('.rustscript-field-input');

    root.querySelectorAll('.rustscript-button').forEach((btn) => {
      const label = btn.textContent.trim();
      if (label === 'Use my public key') {
        btn.onclick = () => {
          const pk = this.app.wallet?.returnPublicKey?.() || '';
          if (input && pk) {
            input.value = pk;
          }
        };
      } else if (label === 'Apply') {
        btn.onclick = () => {
          if (typeof this.onApply === 'function') {
            this.onApply(input?.value ?? '');
          }
          this.overlay.hide();
        };
      } else if (label === 'Cancel') {
        btn.onclick = () => {
          this.overlay.hide();
        };
      }
    });
  }
}

module.exports = PublicKeyFieldOverlay;
