this.importStrategyCard("diplomacy", {
  name: "Diplomacy",
  rank: 2,
  img: "/strategy/2_DIPLOMACY.png",
  text: "<b>Player</b> exhausts sector and refreshes two planets.<hr /><b>Others</b> may refresh two planets.",
  strategyPrimaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player == strategy_card_player && player == strategy_card_player) {

            imperium_self.game.status = 'Select sector to quagmire in diplomatic negotiations, and refresh any planets in that system: ';
      imperium_self.hud.prepareIdle(imperium_self.game.status);
      imperium_self.hud.updateCards([]);
      imperium_self.playerSelectSector(function(sector) {

        if (sector.indexOf("_") > -1) {
          sector = imperium_self.game.board[sector].tile;
        }

        imperium_self.addMove("resolve\tstrategy");
        imperium_self.addMove("strategy\t" + "diplomacy" + "\t" + strategy_card_player + "\t2");
        imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
        imperium_self.addMove("resetconfirmsneeded\t" + imperium_self.game.state.players_info.length);
        imperium_self.addMove("NOTIFY\t" + imperium_self.returnFaction(imperium_self.game.player) + " uses Diplomacy to activate " + imperium_self.game.sectors[sector].name);

        for (let i = 0; i < imperium_self.game.state.players_info.length; i++) {
          imperium_self.addMove("activate\t" + (i + 1) + "\t" + sector);
        }

        //
        // re-activate any planets in that system
        //
        let sys = imperium_self.returnSectorAndPlanets(sector);
        if (sys.p) {
          for (let i = 0; i < sys.p.length; i++) {
            if (sys.p[i].owner == imperium_self.game.player) {
              for (let p in imperium_self.game.planets) {
                if (sys.p[i] == imperium_self.game.planets[p]) {
                  imperium_self.addMove("unexhaust\t" + imperium_self.game.player + "\t" + "planet" + "\t" + p);
                }
              }
            }
          }
        }
        imperium_self.saveSystemAndPlanets(sys);
        imperium_self.endTurn();


      });
    }
    return 0;

  },

  strategySecondaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player != strategy_card_player && imperium_self.game.player == player) {

      let html = '<div class="status-message">Do you wish to spend 1 strategy token to unexhaust two planet cards? </div>';
      if (imperium_self.game.state.round == 1) {
        html = `<div class="status-message doublespace">${imperium_self.returnFaction(strategy_card_player)} plays Diplomacy. Do you wish to spend 1 strategy token to unexhaust two planet cards. You have ${imperium_self.game.state.players_info[player - 1].strategy_tokens} strategy tokens.</div>`;
      }
      let menu = [];
      if (imperium_self.game.state.players_info[player - 1].strategy_tokens > 0) {
        menu.push({ id: 'yes', label: 'Yes' });
      }
      menu.push({ id: 'no', label: 'No' });
            imperium_self.game.status = html;
      imperium_self.hud.preparePrompt(imperium_self.game.status);
      imperium_self.hud.updateCards([]);
      imperium_self.hud.updateMenu(menu, function (id) {

        if (id == "yes") {

          let array_of_cards = imperium_self.returnPlayerExhaustedPlanetCards(imperium_self.game.player); // unexhausted

          let choices_selected = 0;
          let max_choices = 0;

          let remaining = [];
          for (let z = 0; z < array_of_cards.length; z++) {
            max_choices++;
            remaining.push(String(z));
          }
          if (max_choices >= 2) {
            max_choices = 2;
          }

          imperium_self.lockInterface();

          let renderUnexhaustMenu = function () {
            let menu = [];
            if (remaining.length == 0) {
              menu.push({ id: 'cancel', label: 'cancel (no options)' });
            } else {
              for (let z = 0; z < remaining.length; z++) {
                let idx = parseInt(remaining[z]);
                let planet = imperium_self.game.planets[array_of_cards[idx]];
                menu.push({ id: remaining[z], label: planet && planet.name ? planet.name : array_of_cards[idx] });
              }
            }
            imperium_self.game.status = 'Select planets to unexhaust:';
            imperium_self.hud.preparePrompt(imperium_self.game.status);
            imperium_self.hud.updateCards([]);
            imperium_self.hud.updateMenu(menu, function (action2) {

              if (!imperium_self.mayUnlockInterface()) {
                salert("The game engine is currently processing moves related to another player's move. Please wait a few seconds and reload your browser.");
                return;
              }
              imperium_self.unlockInterface();

              if (action2 === "cancel") {
                imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
                imperium_self.addPublickeyConfirm(imperium_self.getPublicKey(), 1);
                imperium_self.endTurn();
                return;
              }

              let idx = parseInt(action2);
              choices_selected++;
              imperium_self.addMove("unexhaust\t" + imperium_self.game.player + "\tplanet\t" + array_of_cards[idx]);
              remaining = remaining.filter((id) => id !== action2);

              if (choices_selected >= max_choices) {
                imperium_self.prependMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
                imperium_self.addPublickeyConfirm(imperium_self.getPublicKey(), 1);
                imperium_self.addMove("expend\t" + imperium_self.game.player + "\tstrategy\t1");
                imperium_self.endTurn();
                return;
              }

              imperium_self.lockInterface();
              renderUnexhaustMenu();
            });
          };
          renderUnexhaustMenu();
        }

        if (id == "no") {
          imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
          imperium_self.addPublickeyConfirm(imperium_self.getPublicKey(), 1);
          imperium_self.endTurn();
          return 0;
        }

      });

    }

  },
});


