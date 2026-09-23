this.importStrategyCard("trade", {
  name: "Trade",
  rank: 5,
  img: "/strategy/5_TRADE.png",
  text: "<b>Player</b> gains 3 trade goods, may distribute commodities.<hr /><b>Others</b> may purchase commodities.",
  strategyPrimaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player == strategy_card_player && player == strategy_card_player) {

      imperium_self.addMove("resolve\tstrategy");
      imperium_self.addMove("strategy\t" + "trade" + "\t" + strategy_card_player + "\t2");
      imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
      imperium_self.addMove("resetconfirmsneeded\t" + imperium_self.game.state.players_info.length);
      imperium_self.addMove("purchase\t" + imperium_self.game.player + "\tgoods\t3");
      imperium_self.addMove("purchase\t" + imperium_self.game.player + "\tcommodities\t" + imperium_self.game.state.players_info[imperium_self.game.player - 1].commodity_limit);

      let factions = imperium_self.returnFactions();
      let html = '<p class="status-message">Replenish commodities for any other player?</p>';
      let menu = [];
      for (let i = 0; i < imperium_self.game.state.players_info.length; i++) {
        if (i != imperium_self.game.player - 1) {
          menu.push({ id: String(i), label: factions[imperium_self.game.state.players_info[i].faction].name });
        }
      }
      menu.push({ id: 'finish', label: 'done' });

            imperium_self.game.status = html;
      imperium_self.hud.updateStatus(imperium_self.game.status);
      imperium_self.hud.updateCards([]);

      let trade_menu = menu.slice();
      let render_trade_menu = function () {
        imperium_self.hud.updateMenu(trade_menu, function(id) {
        if (id != "finish") {
          imperium_self.addMove("purchase\t" + (parseInt(id) + 1) + "\tcommodities\t" + imperium_self.game.state.players_info[id].commodity_limit);
          trade_menu = trade_menu.filter((opt) => opt.id != id);
          render_trade_menu();
        } else {
          imperium_self.endTurn();
        }
      });
      };
      render_trade_menu();

    }

  },
  strategySecondaryEvent: function(imperium_self, player, strategy_card_player) {

    if (imperium_self.game.player == player && imperium_self.game.player != strategy_card_player) {

      if (imperium_self.game.state.players_info[player - 1].commodities == imperium_self.game.state.players_info[player - 1].commodity_limit) {
        imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
        imperium_self.updateLog(imperium_self.returnFaction(player) + " skips the Trade secondary as they have already refreshed commodities");
        imperium_self.endTurn();
        return 1;
      }

      let html = '<p>Trade has been played. Do you wish to spend 1 strategy token to refresh your commodities? </p>';
      if (imperium_self.game.state.round == 1) {
        html = `<div class="status-message doublespace">${imperium_self.returnFaction(strategy_card_player)} has played the Trade strategy card. You may spend 1 strategy token to refresh your faction commodities, which may be exchanged with your neighbours on the board for trade goods. You have ${imperium_self.game.state.players_info[player - 1].strategy_tokens} strategy tokens. Use this ability? </div>`;
      }
      let menu = [];
      if (imperium_self.game.state.players_info[player - 1].strategy_tokens > 0) {
        menu.push({ id: 'yes', label: 'Yes' });
      }
      menu.push({ id: 'no', label: 'No' });


      if (imperium_self.game.state.players_info[imperium_self.game.player - 1].commodities == imperium_self.game.state.players_info[imperium_self.game.player - 1].commodity_limit) {
        imperium_self.addMove("resolve\tstrategy\t1\t" + imperium_self.getPublicKey());
        imperium_self.addPublickeyConfirm(imperium_self.getPublicKey(), 1);
        imperium_self.addMove("NOTIFY\t" + imperium_self.returnFaction(imperium_self.game.player) + " already has commodities and skips trade secondary");
        imperium_self.endTurn();
        return 0;
      }


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
          imperium_self.addMove("purchase\t" + imperium_self.game.player + "\tcommodities\t" + imperium_self.game.state.players_info[imperium_self.game.player - 1].commodity_limit);
          imperium_self.addMove("expend\t" + imperium_self.game.player + "\tstrategy\t1");
          imperium_self.endTurn();
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

