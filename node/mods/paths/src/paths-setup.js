

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
      let options = this.game.options || {};
      let hand_size = scenario.handSize;
      if (options.hand_size === "7" || options.hand_size === "8") {
        hand_size = parseInt(options.hand_size, 10);
      }
      let modified_trench_rolls = !!scenario.modifiedTrenchRolls;
      if (options.trench_rolls === "yes" || options.trench_rolls === "no") {
        modified_trench_rolls = options.trench_rolls === "yes";
      }
      let guns_must_event = false;
      if (scenario.gunsOfAugust) {
        guns_must_event = !!scenario.gunsMustEvent;
        if (options.guns_event === "yes" || options.guns_event === "no") {
          guns_must_event = options.guns_event === "yes";
        }
      }
      this.game.state.rules = {
        hand_size: hand_size,
        modified_trench_rolls: modified_trench_rolls,
        guns_must_event: guns_must_event,
        ap_wins_draws: !!scenario.apWinsDraws,
        german_rp_bonus: !!scenario.germanRpBonus,
        peace_terms: scenario.peaceTerms !== false,
        british_mo_to_french: !!scenario.britishMoToFrench,
        historical_endgame_vp: !!scenario.historicalEndgameVp,
        italian_movement: !!scenario.italianMovement
      };
      let opening_hand = this.game.state.rules.hand_size;
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


