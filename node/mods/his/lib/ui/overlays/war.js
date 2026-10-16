const HudLayer = require('../hud-layer');
const WarTemplate = require('./war.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class WarOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod);
  }

  hide() {
    this.visible = false;
    this.overlay.hide();
  }

  pullHudOverOverlay() {
    HudLayer.pullHudOverOverlay.call(this);
  }
  pushHudUnderOverlay() {
    HudLayer.pushHudUnderOverlay.call(this);
  }

  render(faction = '') {
    this.visible = true;
    this.overlay.show(WarTemplate());
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = WarOverlay;
