const ImperiumAgendaVotingOverlayTemplate = require('./agenda-voting.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class AgendaVotingOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.overlay.clickToClose = false;
  }

  hide() {
    try {
      this.overlay.hide();

      //
      // return to smaller proportions
      //
      let el = document.getElementById('game-hud2');
      if (el) {
        el.classList.remove('voting-hud');
        el.style.top = 'unset';
        el.style.bottom = '0px';
        el.style.zIndex = 11;
      }

      if (document.querySelector('.dashboard')) {
        document.querySelector('.dashboard').style.zIndex = 10;
      }
    } catch (err) {}
  }

  render(card, mycallback) {
    this.overlay.show(ImperiumAgendaVotingOverlayTemplate());
    this.overlay.setBackground('/imperium/img/backgrounds/senate_bays.png', false);

    //
    // pull GAME HUD over overlay
    //
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex + 1;
    }

    //
    // pull FACTION DASH over overlay
    //
    if (document.querySelector('.dashboard')) {
      document.querySelector('.dashboard').style.zIndex = overlay_zindex + 1;
    }

    //
    // increase hud size
    //
    if (hud) {
      hud.classList.add('voting-hud');
    }

    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = AgendaVotingOverlay;
