
    //
    // ABM Treaty
    //
    if (card == "abmtreaty") {

//      this.game.state.back_button_cancelled = 1;
      this.game.status = '<div class="status-message" id="status-message">' + player.toUpperCase() + " <span>plays ABM Treaty</span></div>";
      this.hud.updateStatus(this.game.status);
      this.hud.updateMenu([]);
      this.hud.updateCards([]);

      this.updateLog("DEFCON increases by 1");

      this.game.state.defcon++;
      if (this.game.state.defcon > 5) { this.game.state.defcon = 5; }
      this.updateDefcon();

      this.game.queue.push("resolve\tabmtreaty");
      this.game.queue.push("ops\t"+player+"\tabmtreaty\t4");
      
      return 1;
    }




