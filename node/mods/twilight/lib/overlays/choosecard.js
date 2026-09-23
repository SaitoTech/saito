const ChoiceTemplate = require('./choosecard.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ChoiceOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.cards = null;
    this.title = null;

    this.is_visible = false;

    this.overlay = new SaitoOverlay(app, mod, false, true, false);
    this.overlay.clickBackdropToClose = false;
  }

  hide() {
    this.is_visible = false;
    this.overlay.hide();
  }

  render(card1 = '', card2 = '', stage = '') {
    this.is_visible = true;

    let twilight_self = this.mod;
    let ui_self = this;
    let deck = this.mod.returnAllCards(true);

    let msg = 'Choose Card for Mid-War';
    if (stage == 'latewar') {
      msg = 'Choose Card for Mid-War';
    }

    let options = [];
    if (deck[card1]?.name) {
      options.push({ id: card1, label: deck[card1].name });
    }
    if (deck[card2]?.name) {
      options.push({ id: card2, label: deck[card2].name });
    }

    this.overlay.show(ChoiceTemplate(this.mod, card1, card2, stage));

    twilight_self.game.status = msg;
    twilight_self.hud.updateStatus(twilight_self.game.status);
    twilight_self.hud.updateCards([]);
    twilight_self.hud.updateMenu(options);

    $('.option').off();
    $('.option').on('click', function () {
      let action = $(this).attr('id');

      if (stage == 'latewar') {
        twilight_self.addMove('add_latewar_card_to_deck\t' + action);
      } else {
        twilight_self.addMove('add_midwar_card_to_deck\t' + action);
      }
      twilight_self.endTurn();
      twilight_self.game.status = 'waiting for opponent to choose...';
      twilight_self.hud.updateStatus(twilight_self.game.status);
      twilight_self.hud.updateMenu([]);
      twilight_self.hud.updateCards([]);
      ui_self.hide();
    });
  }

  attachEvents() {}
}

module.exports = ChoiceOverlay;
