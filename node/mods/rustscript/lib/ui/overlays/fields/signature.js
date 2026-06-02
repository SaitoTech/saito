const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SignatureFieldTemplate = require('./signature.template');

class SignatureFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    this.overlay.show(SignatureFieldTemplate(this.path, this.currentValue));
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
      if (label === 'Sign message') {
        btn.onclick = async () => {
          const msg = this.mod.getField('msg') || '';
          if (!msg || typeof this.app.wallet?.signMessage !== 'function') {
            return;
          }
          const sig = await this.app.wallet.signMessage(msg);
          if (input && sig) {
            input.value = sig;
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

module.exports = SignatureFieldOverlay;
