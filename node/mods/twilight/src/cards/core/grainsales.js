

    //
    // Grain Sales to Soviets
    //
    if (card == "grainsales") {

      let twilight_self = this;

      //
      // Soviets self-report - TODO provide proof
      // of randomness
      //
      if (this.game.player == 1) {
      
        this.addMove("resolve\tgrainsales");

        let available_cards = [];
        for (let i = 0; i < twilight_self.game.deck[0].hand.length; i++) {
          let thiscard = twilight_self.game.deck[0].hand[i];
          if (thiscard != "china" && (!(this.game.state.headline == 1 && (thiscard == this.game.state.headline_opponent_card || thiscard == this.game.state.headline_card)))) {
            available_cards.push(thiscard);
          }
        }

        if (available_cards.length == 0) {
          let burnrand = this.rollDice();
          this.addMove("ops\tus\tgrainsales\t2");
          this.addMove("setvar\tgame\tstate\tback_button_cancelled\t1");
          this.addMove(`NOTIFY\tUSSR has no cards to give for ${this.cardToText(card)}`);
          this.endTurn();
          return 0;
        } else {

          twilight_self.rollDice(available_cards.length, function(roll) {

            roll = parseInt(roll)-1;
            let newcard = available_cards[roll];

            twilight_self.removeCardFromHand(newcard);
            twilight_self.addMove("grainsales\tussr\t"+newcard);
            twilight_self.addMove("setvar\tgame\tstate\tback_button_cancelled\t1");
            twilight_self.addMove("notify\tUSSR shares "+twilight_self.cardToText(newcard));
            twilight_self.endTurn();
            twilight_self.game.status = `<div class='status-message' id='status-message'>Sending ${twilight_self.cardToText(newcard)} to US</div>`;
            twilight_self.hud.updateStatus(twilight_self.game.status);
            twilight_self.hud.updateMenu([]);
            twilight_self.hud.updateCards([]);
          });
        }
      }else{
        let burnrand = this.rollDice();
      }
      return 0;
    }



