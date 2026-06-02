const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const HashFieldTemplate = require('./hash.template');

class HashFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    this.overlay.show(HashFieldTemplate(this.path, this.currentValue));
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
      if (label === 'Hash witness input') {
        btn.onclick = () => {
          const preimage = this.mod.getField('input') || this.mod.getField('witness.input') || '';
          if (!preimage || !this.app.crypto?.hash) {
            return;
          }
          const digest = this.app.crypto.hash(preimage, 'hex');
          if (input && digest) {
            input.value = digest;
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

module.exports = HashFieldOverlay;
