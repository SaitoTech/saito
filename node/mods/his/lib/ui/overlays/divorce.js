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
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex + 1;
    }
  }

  pushHudUnderOverlay() {
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex - 2;
    }
  }

  render() {
    this.overlay.show(DivorceTemplate());
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = DivorceOverlay;
