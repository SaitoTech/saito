const ComposeOverlay = require('./ui/overlays/compose');

class Composer {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.compose = mod.compose || new ComposeOverlay(app, mod);
  }

  open(options = {}) {
    this.compose.open(options);
  }

  close() {
    this.compose.close();
  }
}

module.exports = Composer;
