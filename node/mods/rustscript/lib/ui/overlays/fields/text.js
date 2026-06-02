const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const TextFieldTemplate = require('./text.template');

class TextFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    this.overlay.show(TextFieldTemplate(this.path, this.currentValue, 'Text value'));
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
      if (label === 'Apply') {
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

module.exports = TextFieldOverlay;
