const HudLayer = require('../hud-layer');
const DivorceTemplate = require('./marriage.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class DivorceOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod);
    this.selected = [];
    this.bonus = 0;
    this.roll = 0;
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

  render() {
    this.overlay.show(DivorceTemplate());
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = DivorceOverlay;
