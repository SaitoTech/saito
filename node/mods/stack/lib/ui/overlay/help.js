const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const HelpTemplate = require('./help.template');

class HelpOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
  }

  render() {
    this.overlay.show(HelpTemplate());
  }
}

module.exports = HelpOverlay;
