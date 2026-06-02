const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const LogicalFieldTemplate = require('./logical.template');

class LogicalFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    this.overlay.show(LogicalFieldTemplate(this.path, this.currentValue));
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rustscript-field');
    if (!root) {
      return;
    }

    root.querySelectorAll('.rustscript-button').forEach((btn) => {
      if (btn.textContent.trim() === 'Close') {
        btn.onclick = () => {
          this.overlay.hide();
        };
      }
    });
  }
}

module.exports = LogicalFieldOverlay;
