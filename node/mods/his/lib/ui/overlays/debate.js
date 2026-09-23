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
