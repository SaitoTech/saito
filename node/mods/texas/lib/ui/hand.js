const HandTemplate = require('./hand.template');

class Hand {
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;
    this.el = null;
  }

  render(cards_html = '') {
    if (!this.game_mod.gameBrowserActive() && !this.game_mod.browser_active) {
      return;
    }

    if (!document.getElementById('texas-hand')) {
      this.app.browser.addElementToSelector(HandTemplate(), '.texas-table');
    }

    this.el = document.getElementById('texas-hand');
    if (!this.el) {
      return;
    }

    if (!this.game_mod.game.player) {
      return;
    }

    try {
      if (cards_html === '') {
        if (!this.game_mod.game.deck?.[0]) {
          return;
        }
        let { cards, hand } = this.game_mod.game.deck[0];
        let cards_in_hand = hand.map((key) => cards[key]);
        cards_html = cards_in_hand
          .map((card) => `<img class="card" src="${this.game_mod.card_img_dir}/${card.name}">`)
          .join('');
      }

      if (cards_html) {
        this.el.innerHTML = cards_html;
      }

      this.el.style.display = '';
    } catch (err) {}
  }

  hide() {
    if (this.el) {
      this.el.style.display = 'none';
    }
  }
}

module.exports = Hand;
