const PotTemplate = require('./pot.template');
const PotDetailsTemplate = require('./pot-details.template');
const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');

class Pot {
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;
    this.pot_active = true;
    this.overlay = new SaitoOverlay(app, mod);
    this.displayedPot = null;
    this.animationEndHandlers = new WeakMap();
  }

  render(pot = -1) {
    if (!this.game_mod.gameBrowserActive() && !this.game_mod.browser_active) {
      return;
    }

    const potAlreadyMounted = !!document.querySelector('.poker-pot');

    if (pot == -1) {
      pot = 0;
      if (this.pot_active && this.game_mod.game?.state?.player_pot) {
        for (let i = 0; i < this.game_mod.game.state.player_pot.length; i++) {
          pot += this.game_mod.game.state.player_pot[i];
        }
      }
    }

    if (!document.querySelector('.poker-pot')) {
      if (!this.ticker) {
        this.ticker = this.game_mod.returnTicker();
      }
      this.app.browser.addElementToSelector(PotTemplate(), '.poker-sidebar');
    }

    try {
      if (!this.pot_active) {
        document.querySelector('.poker-pot').classList.add('invisible');
      } else {
        document.querySelector('.poker-pot').classList.remove('invisible');
      }

      const l2 = document.querySelector('.poker-pot .line2');
      const l3 = document.querySelector('.poker-pot .line3');

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

    const potEl = document.querySelector('.poker-pot');
    if (potEl) {
      this.ensurePotShine(potEl);
      const previousPot = this.displayedPot;
      this.displayedPot = pot;
      if (potAlreadyMounted && Number.isFinite(previousPot) && pot > previousPot) {
        this.animatePotIncrease(potEl);
      }
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
    if (document.querySelector('.poker-pot .line2')) {
      document.querySelector('.poker-pot .line2').classList.add('pulse');
    }
  }

  ensurePotShine(potEl) {
    if (!potEl.querySelector('.pot-shine')) {
      potEl.insertAdjacentHTML('afterbegin', '<div class="pot-shine" aria-hidden="true"></div>');
    }
  }

  animatePotIncrease(potEl) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const chipEl = potEl.querySelector('.pot-chip');
    if (!chipEl) {
      return;
    }

    this.restartCssAnimation(chipEl, 'pot-chip-spin', 'pot-chip-spin');
    this.restartCssAnimation(potEl, 'pot-shimmer', 'pot-shimmer');
  }

  restartCssAnimation(el, className, animationName) {
    const previous = this.animationEndHandlers.get(el);
    if (previous) {
      el.removeEventListener('animationend', previous);
      this.animationEndHandlers.delete(el);
    }

    el.classList.remove(className);
    void el.offsetWidth;

    const onEnd = (event) => {
      if (event.animationName !== animationName) {
        return;
      }
      el.classList.remove(className);
      el.removeEventListener('animationend', onEnd);
      if (this.animationEndHandlers.get(el) === onEnd) {
        this.animationEndHandlers.delete(el);
      }
    };

    this.animationEndHandlers.set(el, onEnd);
    el.addEventListener('animationend', onEnd);
    el.classList.add(className);
  }

  attachEvents() {
    const potEl = document.querySelector('.poker-pot');
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
