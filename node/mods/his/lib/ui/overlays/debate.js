const HudLayer = require('../hud-layer');
const DebateTemplate = require('./debate.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class DebateOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod);
  }

  pullHudOverOverlay() {
    HudLayer.pullHudOverOverlay.call(this);
  }
  pushHudUnderOverlay() {
    HudLayer.pushHudUnderOverlay.call(this);
  }

  hide() {
    this.visible = false;
    this.pushHudUnderOverlay();
    this.overlay.hide();
  }

  render(res = null) {
    if (res == null) {
      return;
    }
    this.visible = true;
    this.overlay.show(DebateTemplate(res));
    this.pullHudOverOverlay();
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = DebateOverlay;
