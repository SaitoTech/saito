const LoadRomOverlayTemplate = require('./load-rom.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LoadRomOverlay {
  constructor(app, mod = null, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render(opts = {}) {
    this.overlay.show(LoadRomOverlayTemplate(opts));
  }

  hide() {
    try {
      this.overlay.hide();
    } catch (err) {}
  }
}

module.exports = LoadRomOverlay;
