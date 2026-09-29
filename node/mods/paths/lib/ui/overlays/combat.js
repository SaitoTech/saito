const CombatTemplate = require('./combat.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class CombatOverlay {
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
    //
    // pull GAME HUD over overlay
    //
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex + 1;
    }
  }
  pushHudUnderOverlay() {
    //
    // push GAME HUD under overlay
    //
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex - 2;
    }
  }

  render(faction = '') {
    this.overlay.show(CombatTemplate());
    this.pushHudUnderOverlay();
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = CombatOverlay;
