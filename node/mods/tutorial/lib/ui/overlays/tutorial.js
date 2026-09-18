const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const TutorialOverlayTemplate = require('./tutorial.template');

class TutorialOverlay {

  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.callback = null;
  }

  render() {
    this.overlay.show(TutorialOverlayTemplate(this.app, this.mod, this));
    this.attachEvents();
  }

  attachEvents() {
  }

}

module.exports = TutorialOverlay;

