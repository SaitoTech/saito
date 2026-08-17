/**
 * Thin Texas adapter around the shared GameCardfan.
 * Keeps the original poker hand rendering path (direct <img class="card">)
 * while mounting into the stable .texas-play slot.
 */
const GameCardfan = require('../../../../lib/saito/ui/game-cardfan/game-cardfan');

class Hand extends GameCardfan {
  constructor(app, mod) {
    super(app, mod);
    this.container = '.texas-play';
  }

  render(cards_html = '') {
    if (!this.game_mod.gameBrowserActive() && !this.game_mod.browser_active) {
      return;
    }

    // Ensure the stable play mount exists before GameCardfan injects #cardfan.
    if (!document.querySelector('.texas-play')) {
      return;
    }

    super.render(cards_html);

    this.el = document.getElementById('cardfan');
    if (this.el) {
      this.el.classList.add('texas-hand');
      this.el.style.display = 'block';
      this.el.style.visibility = '';
      this.el.style.pointerEvents = '';
    }
  }

  hide() {
    this.el = document.getElementById('cardfan');
    if (this.el) {
      // Preserve reserved geometry — do not collapse the play slot.
      this.el.style.visibility = 'hidden';
      this.el.style.pointerEvents = 'none';
    }
  }

  show() {
    this.el = document.getElementById('cardfan');
    if (this.el) {
      this.el.style.display = 'block';
      this.el.style.visibility = '';
      this.el.style.pointerEvents = '';
    }
  }

  attachEvents() {
    // Keep the hand fixed in the table composition (do not make #cardfan draggable).
  }
}

module.exports = Hand;
