this.importStrategyCard("construction", {
  name: "Construction",
  rank: 4,
  img: "/strategy/4_CONSTRUCTION.png",

  text: "<b>Player</b> gets free Space Dock and PDS unit.<hr /><b>Others</b> may purchase a PDS or Space Dock.",
  strategyPrimaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player == strategy_card_player && player == strategy_card_player) {
      imperium_self.addMove("resolve\tstrategy");
      imperium_self.addMove("strategy\t" + "construction" + "\t" + strategy_card_player + "\t2");
      imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
      imperium_self.addMove("resetconfirmsneeded\t" + imperium_self.game.state.players_info.length);
      imperium_self.playerAcknowledgeNotice("You have played Construction. First you will have the option of producing a PDS or Space Dock. Then you will have the option of producing an additional PDS if you so choose.", function() {
        imperium_self.playerBuildInfrastructure((sector) => {
          imperium_self.playerBuildInfrastructure((sector) => {
            imperium_self.updateSectorGraphics(sector);
            imperium_self.endTurn();
          }, 2);
        }, 1);
      });
    }

  },


  strategySecondaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player != strategy_card_player && imperium_self.game.player == player) {

      let html = '<div class="status-message">Construction has been played. Do you wish to spend 1 strategy token to build a PDS or Space Dock? This will activate the sector (if unactivated): </div>';
      if (imperium_self.game.state.round == 1) {
        html = `<div class="status-message doublespace">${imperium_self.returnFaction(strategy_card_player)} has played the Construction strategy card. You may spend 1 strategy token to build a PDS or Space Dock on a planet you control (this will activate the sector). You have ${imperium_self.game.state.players_info[player - 1].strategy_tokens} strategy tokens. Use this ability? </div>`;
      }
      let menu = [];
      if (imperium_self.game.state.players_info[player - 1].strategy_tokens > 0) {
        menu.push({ id: 'yes', label: 'Yes' });
      }
      menu.push({ id: 'no', label: 'No' });

            imperium_self.game.status = html;
      imperium_self.hud.updateStatus(imperium_self.game.status);
      imperium_self.hud.updateCards([]);

      imperium_self.lockInterface();

      imperium_self.hud.updateMenu(menu, function(id) {

        if (!imperium_self.mayUnlockInterface()) {
          salert("The game engine is currently processing moves related to another player's move. Please wait a few seconds and reload your browser.");
          return;
        }
        imperium_self.unlockInterface();


        if (id == "yes") {
          imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
          imperium_self.addPublickeyConfirm(imperium_self.getPublicKey(), 1);
          imperium_self.addMove("expend\t" + imperium_self.game.player + "\tstrategy\t1");
          imperium_self.playerBuildInfrastructure((sector) => {
            imperium_self.addMove("activate\t" + imperium_self.game.player + "\t" + sector);
            imperium_self.updateSectorGraphics(sector);
            imperium_self.endTurn();
          }, 1);
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



