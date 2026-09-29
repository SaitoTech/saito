const CardTemplate = require('./card.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class CardOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
  }

  //obj = {player, card: cardname}

  render(obj = {}) {
    let player = obj.player;
    let cardname = obj.card;
    let card;

    for (let i = 0; i < this.mod.deck.length; i++) {
      if (this.mod.deck[i].card === cardname) {
        card = this.mod.deck[i];
        break;
      }
    }

    if (!card) {
      console.error('Card not found', cardname);
      return;
    }

    if (!obj?.cardtext) {
      let cardtext = card.text.toLowerCase();
      if (player == this.mod.game.player) {
        cardtext =
          'You' + cardtext.replace('earns', 'earn').replace('moves', 'move').replace('is', 'are');
      } else {
        cardtext = this.mod.game.playerNames[player - 1] + cardtext;
      }
      card.cardtext = cardtext;
    } else {
      card.cardtext = obj.cardtext;
    }

    this.overlay.show(CardTemplate(card));
    setTimeout(() => {
      this.overlay.hide();
    }, 3500);

    // this will clear any ACKNOWLEDGE
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = CardOverlay;
