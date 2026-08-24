const BoardTemplate = require('./board.template');

class Board {
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;
    this.cards_visible = 0;
    this.timer = null;
  }

  render(enable = false) {
    if (enable) {
      delete this.disable;
    }

    if (this.disable) {
      return;
    }

    if (!this.game_mod.gameBrowserActive() && !this.game_mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-board')) {
      this.app.browser.addElementToSelector(BoardTemplate(), '.texas-card-zone');
    }

    this.displayTable();
    this.game_mod.displayHand();
  }

  displayTable() {
    let poker_self = this.game_mod;
    let animate_flip =
      this.game_mod.game?.state?.flipped > 0 &&
      this.game_mod.game.state.flipped > this.cards_visible;

    try {
      if (!document.getElementById('deal')) {
        return;
      }

      let pool = poker_self.game?.pool?.[0];
      let pool_hand = pool?.hand || [];
      let pool_cards = pool?.cards || {};
      let newHTML = '';

      for (let i = 0; i < 5 || i < pool_hand.length; i++) {
        if (i < pool_hand.length && i < this.cards_visible) {
          let card = pool_cards[pool_hand[i]];
          newHTML += `<div class="card slot${i + 1}"><img class="cardFront" src="${poker_self.card_img_dir}/${card.name}"></div>`;
        } else if (i < pool_hand.length) {
          let card = pool_cards[pool_hand[i]];
          newHTML += `<div class="flipped slot${i + 1} card"><img class="cardFront" src="${poker_self.card_img_dir}/${card.name}"><img class="cardBack" src="/texas/img/cards/red.png"></div>`;
        } else {
          newHTML += `<div class="flipped slot${i + 1} card"><img class="cardBack" src="/texas/img/cards/red.png"></div>`;
        }
      }
      document.getElementById('deal').innerHTML = newHTML;

      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (animate_flip && this.cards_visible < pool_hand.length) {
          for (let i = 0; i < pool_hand.length; i++) {
            let obj = document.querySelector(`.slot${i + 1}`);
            if (obj) {
              obj.classList.remove('flipped');
            }
          }
        }
        this.cards_visible = pool_hand.length;
      }, 200);
    } catch (err) {
      console.warn('Card error displaying table:', err);
    }
  }

  clearTable() {
    this.cards_visible = 0;
    this.disable = true;

    //
    // this animation sweeps the cards off the table
    //
    $($('#deal').children().get().reverse()).each(function (index) {
      $(this)
        .delay(50 * index)
        .queue(function () {
          $(this)
            .removeClass('flipped')
            .delay(20 * index)
            .queue(function () {
              $(this)
                .animate({ left: '1000px' }, 1200, 'swing', function () {
                  $(this).remove();
                })
                .dequeue();
            })
            .dequeue();
        });
    });

    //
    // this animation sweeps revealed hands off the table
    //
    $('.game-playerbox-graphics .hand').animate({ left: '1000px' }, 1200, 'swing', function () {
      $(this).remove();
    });
  }
}

module.exports = Board;
