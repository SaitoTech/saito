

    //
    // Missile Envy
    //
    if (card == "missileenvy") {

      let twilight_self = this;


      let ac = this.returnAllCards(true);
      let respondant = 2;
      let opponent = "us";
      if (player == "us") { respondant = 1; opponent = "ussr"; }
      this.game.state.events.missileenvy = 1;

console.log("into missile envy");
console.log("player: " + player);
console.log("opponent: " + opponent);
console.log("respondant: " + respondant);

      //
      // targeted player provided list if multiple options available
      //
      if (this.game.player == respondant) {

        this.addMove("resolve\tmissileenvy");

        let selected_card  = "";
        let selected_ops   = -1;
        let multiple_cards = 0;
        let available_cards = [];

        if (this.game.deck[0].hand.length == 0) {
          this.addMove("notify\t"+opponent.toUpperCase()+" hand contains no cards.");
          this.endTurn();
          return 0;
        }

        for (let i = 0; i < twilight_self.game.deck[0].hand.length; i++) {
          let thiscard = twilight_self.game.deck[0].hand[i];
          if (thiscard != "china" && (!(this.game.state.headline == 1 && (thiscard == this.game.state.headline_opponent_card || thiscard == this.game.state.headline_card)))) {
            available_cards.push(thiscard);
          }
        }

        if (available_cards.length == 0) {
          this.addMove("notify\t"+opponent.toUpperCase()+" hand has no eligible cards.");
          this.endTurn();
          return 0;
        }

        for (let i = 0; i < available_cards.length; i++) {

          let card = ac[available_cards[i]];

          if (this.modifyOps(card.ops, available_cards[i], opponent) == selected_ops) {
            multiple_cards = 1;
          }

          if (this.modifyOps(card.ops, available_cards[i], opponent) > selected_ops) {
            selected_ops  = this.modifyOps(card.ops, available_cards[i], opponent);
            selected_card = available_cards[i];
            multiple_cards = 0;
          }
        }


        if (multiple_cards == 0) {

          //
          // offer highest card
          //
          this.addMove("missileenvy\t" + respondant + "\t"+selected_card);
          this.endTurn();

        } else {

          //
          // select highest card
          //
          let options = [];
          for (let i = 0; i < available_cards.length; i++) {
            if (this.modifyOps(ac[available_cards[i]].ops, available_cards[i], opponent) == selected_ops && available_cards[i] != "china") {
              options.push({ id: available_cards[i], label: ac[available_cards[i]].name });
            }
          }
          this.game.status = "Select card to give opponent:";
          this.hud.updateStatus(this.game.status);
          this.hud.updateCards([]);
          this.hud.updateMenu(options, function(action2) {

            //
            // offer card
            //
            twilight_self.addMove("missileenvy\t" + respondant + "\t"+action2);
            twilight_self.endTurn();

          });
        }
      }else{
        this.game.status = `<div class='status-message' id='status-message'>${this.roles[respondant].toUpperCase()} is returning card for ${this.cardToText(card)}</div>`;
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
      }
      return 0;
    }



