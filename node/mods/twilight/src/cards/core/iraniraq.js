
    if (card == "iraniraq") {

      let opponent = (this.game.player == 2)? "ussr" : "us";
      let success = 0;
      
      this.startClockAndSetActivePlayer(this.roles.indexOf(player));
      
      if (this.roles[this.game.player] == player) {
        
        var twilight_self = this;

        twilight_self.playerFinishedPlacingInfluence();
        twilight_self.addMove("resolve\tiraniraq");

	let invasion_already_triggered = false;
        let invasion_function = (invaded) => {

          if (invasion_already_triggered) { return; }
          invasion_already_triggered = true;

          $(".westerneurope").removeClass("westerneurope");

          let target = 4;
          let modifications = 0;
          let winner = "";

          for (let c of twilight_self.countries[invaded].neighbours){
            if (twilight_self.isControlled(opponent, c) == 1) { modifications++; }
          }

          let die = twilight_self.rollDice(6);
          twilight_self.addMove("NOTIFY\t"+player.toUpperCase()+`rolls: ${die}, adjusted: ${die-modifications}`);

          if (die >= target + modifications) { //Successful Invasion
            success = 1;
            winner = (invaded == "iran")? "Iraq invades Iran!": "Iran invades Iraq";

            let influence_change = 0;
            if (player == "us") {
              influence_change = twilight_self.countries[invaded].ussr;
            } else {
              influence_change = twilight_self.countries[invaded].us;
            }
            if (influence_change > 0){
              twilight_self.addMove(`place\t${player}\t${player}\t${invaded}\t${influence_change}`);
              twilight_self.addMove(`remove\t${player}\t${opponent}\t${invaded}\t${influence_change}`);
              twilight_self.placeInfluence(invaded, influence_change, player);
              twilight_self.removeInfluence(invaded, influence_change, opponent);
            }
            twilight_self.addMove(`milops\t${player}\t2`);
            twilight_self.addMove(`vp\t${player}\t2`);
            twilight_self.showInfluence(invaded);

          } else { //India fails invasion
            winner = (invaded == "iran")? "Iran repels Iraq!": "Iraq repels Iran!";
            if (player == "us") {
              twilight_self.addMove("milops\tus\t2");
            } else {
              twilight_self.addMove("milops\tussr\t2");
            }
          }
          twilight_self.addMove(`war\t${card}\t${winner}\t${die}\t${modifications}\t${player}\t${success}`);
          twilight_self.endTurn();

	};

        $("#iran").addClass("westerneurope");
        $("#iran").off();
        $("#iran").on('click', function() {
            invasion_function("iran");
        });

        $("#iraq").addClass("westerneurope");
        $("#iraq").off();
        $("#iraq").on('click', function() {
            invasion_function("iraq");
        });

        twilight_self.game.status = 'Iran-Iraq War. Choose Target:';
        twilight_self.hud.updateStatus(twilight_self.game.status);
        twilight_self.hud.updateCards([]);
        twilight_self.hud.updateMenu([ { id: 'iraq', label: 'Iraq' }, { id: 'iran', label: 'Iran' } ], invasion_function);

      } else {
        let burned = this.rollDice(6);
      }
      return 0;
    }


