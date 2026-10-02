const HudLayer = require('../hud-layer');
const SchmalkaldicTemplate = require('./schmalkaldic.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SchmalkaldicOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod, false, true, true);
  }

  hide() {
    this.overlay.hide();
  }

  pullHudOverOverlay() {
    HudLayer.pullHudOverOverlay.call(this);
  }
  pushHudUnderOverlay() {
    HudLayer.pushHudUnderOverlay.call(this);
  }

  render(faction = '') {
    let his_self = this.mod;

    this.overlay.show(SchmalkaldicTemplate(faction));
    this.pushHudUnderOverlay();
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = SchmalkaldicOverlay;
