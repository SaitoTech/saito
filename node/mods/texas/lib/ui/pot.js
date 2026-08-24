const PotTemplate = require('./pot.template');
const PotDetailsTemplate = require('./pot-details.template');
const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');

class Pot {
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;
    this.pot_active = true;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render(pot = -1) {
    if (!this.game_mod.gameBrowserActive() && !this.game_mod.browser_active) {
      return;
    }

    if (pot == -1) {
      pot = 0;
      if (this.pot_active && this.game_mod.game?.state?.player_pot) {
        for (let i = 0; i < this.game_mod.game.state.player_pot.length; i++) {
          pot += this.game_mod.game.state.player_pot[i];
        }
      }
    }

    if (!document.querySelector('.texas-pot')) {
      if (!this.ticker) {
        this.ticker = this.game_mod.returnTicker();
      }
      this.app.browser.addElementToSelector(PotTemplate(), '.texas-sidebar');
    }

    try {
      if (!this.pot_active) {
        document.querySelector('.texas-pot').classList.add('invisible');
      } else {
        document.querySelector('.texas-pot').classList.remove('invisible');
      }

      const l2 = document.querySelector('.texas-pot .line2');
      const l3 = document.querySelector('.texas-pot .line3');

      // Same CHIP ↔ crypto presentation helper as player boxes.
      if (l2) {
        l2.innerHTML = this.game_mod.returnChipCryptoBalanceHtml(pot);
      }
      if (l3) {
        l3.innerHTML = '';
        l3.hidden = true;
      }
    } catch (err) {
      console.error(err);
    }

    if (pot && !this.game_mod.animating) {
      this.attachEvents();
    }

    return pot;
  }

  activate() {
    this.pot_active = true;
  }

  clearPot() {
    this.pot_active = false;
    this.render(0);
  }

  addPulse() {
    if (document.querySelector('.texas-pot .line2')) {
      document.querySelector('.texas-pot .line2').classList.add('pulse');
    }
  }

  attachEvents() {
    const potEl = document.querySelector('.texas-pot');
    if (!potEl) {
      return;
    }

    potEl.onclick = (e) => {
      // Balance flip handles its own click; still allow opening pot details otherwise.
      if (e.target.closest('.chip-crypto-balance--toggle')) {
        return;
      }
      this.overlay.show(PotDetailsTemplate(this.game_mod));
    };
  }
}

module.exports = Pot;
