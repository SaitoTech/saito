

console.log("INITIALIZING PATHS");

    let first_time_running = 0;

    //
    // initialize
    //
    if (!this.game.state) {

      this.game.state = this.returnState();
      this.game.spaces = this.returnSpaces();
      this.game.state.players_info = this.returnPlayers(this.game.players.length);

console.log("PLAYERS INFO: " + JSON.stringify(this.game.state.players_info));

console.log("\n\n\n\n");
console.log("---------------------------");
console.log("---------------------------");
console.log("------ INITIALIZE GAME ----");
console.log("---------------------------");
console.log("---------------------------");
console.log("---------------------------");
console.log("DECK: " + this.game.options.deck);
console.log("\n\n\n\n");

            this.game.status = "<div class='status-message' id='status-message'>Generating the Game</div>";
      this.hud.updateStatus(this.game.status);
      this.hud.updateMenu([]);
      this.hud.updateCards([]);

      //
      // Game Queue
      //
      this.game.queue.push("turn");	// turn 1
      this.game.queue.push("READY");
      this.game.queue.push("init");

      let scenario = this.returnScenario();
      let opening_hand = scenario.handSize || 7;
      this.game.queue.push("DEAL\t2\t2\t" + opening_hand);
      if (scenario.gunsOfAugust) {
        this.game.queue.push("DEAL\t1\t1\t" + (opening_hand - 1)); // player automatically gets Guns of August
      } else {
        this.game.queue.push("DEAL\t1\t1\t" + opening_hand);
      }

      this.game.queue.push("DECKENCRYPT\t2\t2");
      this.game.queue.push("DECKENCRYPT\t2\t1");
      this.game.queue.push("DECKXOR\t2\t2");
      this.game.queue.push("DECKXOR\t2\t1");

      this.game.queue.push("DECKENCRYPT\t1\t2");
      this.game.queue.push("DECKENCRYPT\t1\t1");
      this.game.queue.push("DECKXOR\t1\t2");
      this.game.queue.push("DECKXOR\t1\t1");

      if (scenario.played) {
        this.game.queue.push("scenario_bury\t2");
        this.game.queue.push("scenario_bury\t1");
      }

      if (scenario.gunsOfAugust) {
        let deck = this.returnMobilizationDeck("central");
        delete deck["cp01"];
        this.game.queue.push("DECK\t1\t"+JSON.stringify(deck));
        this.game.queue.push("DECK\t2\t"+JSON.stringify(this.returnMobilizationDeck("allies")));
      } else {
        this.game.queue.push("DECK\t1\t"+JSON.stringify(this.returnDeck("central")));
        this.game.queue.push("DECK\t2\t"+JSON.stringify(this.returnDeck("allies")));
      }

      //
      // belgium joins the allies
      //
      this.convertCountryToPower("belgium", "allies");

    }

    //
    // all cards with events added to this.deck
    //
    this.deck = this.returnDeck("all");

console.log("INITIALIZING PATHS");

    //
    // and show the board
    //
    this.displayBoard();



  }


