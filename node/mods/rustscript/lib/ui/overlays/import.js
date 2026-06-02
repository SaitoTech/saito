const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ImportTemplate = require('./import.template');

class ImportOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    this.overlay.show(ImportTemplate());
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rustscript-import');
    if (root) {
      root.querySelectorAll('.rustscript-button').forEach((btn) => {
        if (btn.textContent.trim() === 'Close') {
          btn.onclick = () => {
            this.overlay.hide();
          };
        }
      });
    }
  }
}

module.exports = ImportOverlay;
