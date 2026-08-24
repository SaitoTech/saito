
    if (card == "poliovaccine") {

      let my_go = 0;
      if (player == "ussr" && this.game.player == 1) { my_go = 1; }
      if (player == "us" && this.game.player == 2) { my_go = 1; }

      this.startClockAndSetActivePlayer(this.roles.indexOf(player));

      if (my_go == 0) {
        this.updateStatus("Waiting for Opponent to play Polio Vaccine");
        return 0;

      }
      if (my_go == 1) {

        var twilight_self = this;
        let cards_discarded = 0;
        twilight_self.addMove("resolve\tpoliovaccine");

        let finish_discard = () => {

          if (twilight_self.game.player == 1) {
            twilight_self.addMove("DEAL\t1\t1\t"+cards_discarded);
          }
          if (twilight_self.game.player == 2) {
            twilight_self.addMove("DEAL\t1\t2\t"+cards_discarded);
          }

          //
          // are there enough cards available, if not, reshuffle
          //
          if (cards_discarded > twilight_self.game.deck[0].crypt.length) {

            let discarded_cards = twilight_self.returnDiscardedCards();
            if (Object.keys(discarded_cards).length > 0) {

              //
              // shuffle in discarded cards
              //
              twilight_self.addMove("SHUFFLE\t1");
              twilight_self.addMove("DECKRESTORE\t1");
              twilight_self.addMove("DECKENCRYPT\t1\t2");
              twilight_self.addMove("DECKENCRYPT\t1\t1");
              twilight_self.addMove("DECKXOR\t1\t2");
              twilight_self.addMove("DECKXOR\t1\t1");
              twilight_self.addMove("flush\tdiscards"); // opponent should know to flush discards as we have
              twilight_self.addMove("DECK\t1\t"+JSON.stringify(discarded_cards));
              twilight_self.addMove("DECKBACKUP\t1");
              twilight_self.updateLog("cards remaining: " + twilight_self.game.deck[0].crypt.length);
              twilight_self.updateLog("Shuffling discarded cards back into the deck...");

            }
          }
          twilight_self.endTurn();
        };

        let discard_function = () => {

          let remaining = 0;
          let html = "<ul>";
          for (let i = 0; i < twilight_self.game.deck[0].hand.length; i++) {
            if (twilight_self.game.deck[0].hand[i] != "china") {
              html += `<li class="option" id="${twilight_self.game.deck[0].hand[i]}">${twilight_self.game.deck[0].cards[twilight_self.game.deck[0].hand[i]].name}</li>`;
              remaining++;
            }
          }

          if (remaining == 0) {
            if (cards_discarded == 0) {
              twilight_self.addMove("notify\tPlayer has no cards available to discard");
            }
            finish_discard();
            return 0;
          }

          html += '<li class="option dashed nocard" id="finished">finished</li></ul>';

          twilight_self.updateStatusWithOptions("Select cards to discard:", html, function(card) {

            if (card == "finished") {
              finish_discard();
              return;
            }

            cards_discarded++;
            twilight_self.removeCardFromHand(card);
            twilight_self.addMove("discard\t"+player+"\t"+card);

            if (cards_discarded == 3) {
              finish_discard();
            } else {
              discard_function();
            }
          });
        }
	discard_function();
      }

      return 0;
    }


