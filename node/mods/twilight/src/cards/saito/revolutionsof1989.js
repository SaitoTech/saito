
    if (card == "revolutionsof1989") {

      this.game.state.events.revolutionsof1989 = 1;

      let twilight_self = this;

      this.startClockAndSetActivePlayer(2);

      if (this.game.player == 2) {

        this.game.status = `${this.cardToText(card)}: do you want to trigger Final Scoring?`;
        this.hud.updateStatus(this.game.status);
        this.hud.updateCards([]);
        this.hud.updateMenu([ { id: 'endgame', label: 'end the game' }, { id: 'cont', label: 'continue playing' } ], function(action2) {

          if (action2 == "endgame") {
            twilight_self.addMove("final_scoring");
            twilight_self.endTurn();
          }
          if (action2 == "cont") {
            twilight_self.game.status = "Not Triggering Final Scoring...";
            twilight_self.hud.updateStatus(twilight_self.game.status);
            twilight_self.hud.updateMenu([]);
            twilight_self.hud.updateCards([]);
            twilight_self.addMove("resolve\trevolutionsof1989");
            twilight_self.endTurn();
          }
        });
      }
      return 0;
    }


