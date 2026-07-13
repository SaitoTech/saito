const ComposeOverlay = require('./ui/overlays/compose');

class Composer {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.compose_overlay = mod.compose_overlay || new ComposeOverlay(app, mod);
  }

  open(options = {}) {
    this.compose_overlay.open(options);
  }

  close() {
    this.compose_overlay.close();
  }
}

module.exports = Composer;
