
    if (card == "pinochet") {

      this.game.state.events.pinochet = 1;

      this.startClockAndSetActivePlayer(2);

      if (this.game.player == 2) {

        var twilight_self = this;
        twilight_self.playerFinishedPlacingInfluence();

        twilight_self.game.status = `${twilight_self.cardToText(card)}: `;
        twilight_self.hud.updateStatus(twilight_self.game.status);
        twilight_self.hud.updateCards([]);
        twilight_self.hud.updateMenu([ { id: 'chile', label: '2 Influence in Chile' }, { id: 'argentina', label: '2 Influence in Argentina' } ], function(action2) {

          twilight_self.addMove("resolve\tpinochet");
          twilight_self.addMove("pinochet");

          if (action2 == "chile") {

            twilight_self.placeInfluence("chile", 2, "us", function() {
              twilight_self.addMove("place\tus\tus\tchile\t2");
              twilight_self.endTurn();
            });
            return 0;

          }
          if (action2 == "argentina") {

            twilight_self.placeInfluence("argentina", 2, "us", function() {
              twilight_self.addMove("place\tus\tus\targentina\t2");
              twilight_self.endTurn();
            });
            return 0;

          }
        });
      }

      return 0;

    }

