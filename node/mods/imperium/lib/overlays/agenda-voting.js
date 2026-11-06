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
      let root = document.getElementById('saito-overlay' + this.overlay.ordinal);
      if (root) {
        let slot = root.querySelector('.agenda-voting-card');
        if (slot) {
          slot.innerHTML = '';
        }
      }
      this.overlay.hide();
      if (this.mod && this.mod.cardbox) {
        this.mod.cardbox.hide(1);
      }

      //
      // return to smaller proportions
      //
      let el = document.getElementById('game-hud2');
      if (el) {
        el.classList.remove('voting-hud');
        el.style.top = '';
        el.style.bottom = '';
        el.style.zIndex = 11;
      }

      if (document.querySelector('.dashboard')) {
        document.querySelector('.dashboard').style.zIndex = 10;
      }

      document.querySelectorAll('.chat-container').forEach((el) => {
        el.style.zIndex = '';
      });
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

    document.querySelectorAll('.chat-container').forEach((el) => {
      el.style.zIndex = overlay_zindex + 1;
    });

    //
    // increase hud size
    //
    if (hud) {
      hud.classList.add('voting-hud');
    }

    let root = document.getElementById('saito-overlay' + this.overlay.ordinal);
    let slot = root ? root.querySelector('.agenda-voting-card') : null;
    if (slot && card && typeof card.returnCardImage === 'function') {
      slot.innerHTML = card.returnCardImage();
    }

    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = AgendaVotingOverlay;
