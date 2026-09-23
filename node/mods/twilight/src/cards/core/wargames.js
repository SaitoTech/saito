
    if (card == "wargames") {

      if (this.game.state.defcon != 2) {
        this.updateLog("Wargames event cannot trigger as DEFCON is not at 2");
        return 1;
      }

      let twilight_self = this;
      this.startClockAndSetActivePlayer(this.roles.indexOf(player));

      if (i_played_the_card){

        this.game.status = `${this.cardToText(card)}: Do you want to give your opponent 6 VP and End the Game? (VP ties will be won by opponent)`;
        this.hud.updateStatus(this.game.status);
        this.hud.updateCards([]);
        this.hud.updateMenu([ { id: 'endgame', label: 'end the game' }, { id: 'cont', label: 'continue playing' } ], function(action2) {

          if (action2 == "endgame") {
            twilight_self.game.status = "Triggering Wargames...";
            twilight_self.hud.updateStatus(twilight_self.game.status);
            twilight_self.hud.updateMenu([]);
            twilight_self.hud.updateCards([]);
            twilight_self.addMove("resolve\twargames");
            twilight_self.addMove("wargames\t"+player+"\t1");
            twilight_self.endTurn();
          }
          if (action2 == "cont") {
            twilight_self.game.status = "Discarding Wargames...";
            twilight_self.hud.updateStatus(twilight_self.game.status);
            twilight_self.hud.updateMenu([]);
            twilight_self.hud.updateCards([]);
            twilight_self.addMove("resolve\twargames");
            twilight_self.addMove("wargames\t"+player+"\t0");
            twilight_self.endTurn();
          }
        });
      }
      return 0;
    }


