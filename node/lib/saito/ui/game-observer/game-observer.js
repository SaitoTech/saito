const GameObserverLoader = require('./game-observer-loader');
const GameObserverHUD = require('./game-observer-hud');
const Transaction = require('../../transaction').default;

/**
 * An interface for a third party to trace the moves of a game step-by-step
 *
 */
class GameObserver {
  /**
   * @constructor
   * @param app - the Saito Application
   */
  constructor(app, game_mod) {

    this.app = app;
    this.game_mod = game_mod;

    //
    // playback
    //
    this.playback_status = "init";
    this.playback_speed = 2000;
    this.playback_timer = null;

    this.is_downloading = false;
    this.download_timer = null;
    this.latest_step = 0;

    //
    // game transactions
    //
    this.txs = [];
    this.tx_hashmap = {};
    this.buffer = [];
    this.snapshots = [];

    this.index_max = 0;
    this.index_current = 0;
    this.index_range = 20;

    this.loader = new GameObserverLoader(app, game_mod);
    this.hud = new GameObserverHUD(app, this);

    this.playback_timer_active = false;
    this.playback_timer = null;

  }

  updateStatus(message) {

    if (this.hud && this.hud.updateStatus) {
      this.hud.updateStatus(message);
    }

    if (this.loader && this.loader.updateStatus) {
      this.loader.updateStatus(message);
    }

  }

  /**
   * Observer-only initialization: resolve or create game, assign to game_mod.game,
   *
   * observers may not have a copy of the local game, so we create a stub that can hold
   * the game state and the game moves, such that the observer can load the game movecs
   * into its queue and have it execute the game appropriately.
   *
   */
  initialize(game_id) {

     let game = this.game_mod.loadGame(game_id);

     if (!game) {
       this.game_mod.game = {
         id: game_id,
         future: [],
         queue: [],
         step: { game: 0, players: {} },
         players: [],
         player: 0,
         originator: ''
       };
       if (typeof this.game_mod.normalizeGameShape === 'function') {
         this.game_mod.normalizeGameShape(this.game_mod.game);
       }
     }


     if (this.app.BROWSER) {
       this.playback_timer = setInterval(async () => {

         if (this.player_timer_active == true) { return; }

         this.playback_timer_active = true;
console.log("playback timer...");

         if (this.playback_status !== "playing") { return; }
         if (!this.game_mod?.game) { return; }
         if (this.game_mod.halted === 1) { return; }
         if (this.buffer.length === 0) { return; }
         if (this.game_mod.game.future.length > 0) { return; }

         if (this.buffer.length > 0) {

           let tx = this.buffer.shift();

           this.game_mod.game.future.push(
             tx.serialize_to_web ? tx.serialize_to_web(this.app) : tx
           );

           if (this.game_mod.processFutureMoves()) {
             await this.game_mod.runQueue();
           }

         }

         this.playback_timer_active = false;

       }, this.playback_speed);
     }

     this.game_mod.game.player = 0;

  }



  async render() {

    this.loader.render();
    this.hud.render();

    //
    // check status
    //
    if (this.playback_status === "init") {

      //
      // download moves
      //
      this.loader.updateStatus(`Downloading moves (${this.txs.length})`);

      //
      // download timer
      //
      this.download_timer = setInterval(() => {
        if (!this.game_mod?.game) { return; }
        this.download(this.game_mod.game.id);
      }, 3000);

    }

  }

  async download(game_id) {

    if (!this.game_mod?.game) { return null; }
    if (this.is_downloading) { return null; }
    if (!this.game_mod.archive_connected) {
      return null;
    }

    this.is_downloading = true;

    const limit = 20;
    let cursor = this.latest_step;

    this.app.storage.loadTransactions(
      {
        field1: this.game_mod.name,
        field4: game_id,
        field5: cursor,
        field5_sort: 1,
        ascending: 1,
        limit
      },
      async (txs) => {

        let new_tx_found = false;

        for (let tx of txs || []) {
          let sig = tx.signature != null ? tx.signature : tx.hash;
          if (!this.tx_hashmap[sig]) {
            this.txs.push(tx);
            this.tx_hashmap[sig] = this.txs.length - 1;
            new_tx_found = true;
            try {
              let msg = tx.returnMessage ? tx.returnMessage() : (tx.msg || null);
              let step = msg?.step?.game ?? 0;
              if (step > this.latest_step) this.latest_step = step;
            } catch (e) {}
            if (this.playback_status === "playing") {
              this.buffer.push(tx);
            }
          }
        }

        if (new_tx_found) {
          this.index_max = this.txs.length;
          if (this.hud?.setRange) {
            this.hud.setRange(0, this.index_max);
          }
        }

        if (txs && txs.length === limit && new_tx_found) {
          this.loader.updateStatus("Fetching more moves...");
          this.is_downloading = false;
          this.download(game_id);
          return;
        }

        //
        // we only hit this point if we have completely loaded 
	// our game moves from the archive, in which case we 
	// are either in the initial sync-mode, in which case 
	// we want to execute the whole game
	//
	// or we are playing in which case we start feeding them
	// from the buffer into the futures queue and executing 
	// the game that way.
        //
        if (this.playback_status === "init") {

console.log("#");
console.log("#");
console.log("#");
console.log("PLAYBACK STATUS IS INIT!!!!");

          await this.game_mod.initializeGameQueue(this.game_mod.game.id);
          this.game_mod.initialize_game_run = 1;
          if (await this.game_mod.runQueue() == 0) {
            this.game_mod.processFutureMoves();
          }

console.log("###");
console.log("###");
console.log("###");
console.log("AFTER INITIALIZE GAME RUN CHECKED...");

          this.game_mod.halted = 0;

          // snapshot the fully initialized baseline
          this.snapshots = [];
console.log("OBSERVER SNAPSHOT CHECK DECK:", this.game_mod.game.deck);
          this.snapshots.push(JSON.stringify(this.game_mod.game));

          // now replay all moves
          for (let tx of this.txs) {
            this.game_mod.game.future.push(
              tx.serialize_to_web ? tx.serialize_to_web(this.app) : tx
            );
          }

          //this.game_mod.saveFutureMoves(this.game_mod.game.id);
          //this.game_mod.saveGame(this.game_mod.game.id);

          //while (true) {
          //  if (this.game_mod.processFutureMoves()) {
          //    await this.game_mod.runQueue();
          //    continue;
          //  }
          //  break;
          //}

          this.readyToObserve();
        }


        if (this.playback_status === "playing" || this.playback_status === "paused") {
          this.is_downloading = false;
        }
      }
    );
  }


  readyToObserve() {

    this.index_max = this.txs.length;
    this.index_current = this.index_max;
    if (this.hud?.setRange) {
      this.hud.setRange(0, this.index_max);
      this.hud.setPosition(this.index_current);
    }

    this.loader.updateStatus("Game Synchronized...");
    this.hud.updateStatus("Press Play to Observe");
    this.loader.remove();
    this.playback_status = "paused";

  }





  getMovesInRange(min=0, max=100000) {

    let moves = [];

    for (let tx of this.txs) {

      let msg = tx.returnMessage();
      let step = msg?.step?.game ?? 0;

      if (step >= min && step <= max) {
        moves.push(tx);
      }

    }

    return moves;

  }

  async replayToIndex(targetIndex) {

    this.playback_status = "paused";

    if (!this.snapshots || !this.snapshots[0]) {
      return;
    }

    const baseline = JSON.parse(this.snapshots[0]);

    const maxIndex = Math.max(0, this.txs.length);
    const clamped = Math.max(0, Math.min(targetIndex, maxIndex));

    this.loader.render();
    await new Promise(resolve => requestAnimationFrame(resolve));

    this.buffer = [];

    this.game_mod.game = baseline;

    this.game_mod.game.future = [];
    this.game_mod.game.queue = [];

    this.game_mod.halted = 0;
    this.game_mod.gaming_active = 0;

    await this.game_mod.initializeGameQueue(this.game_mod.game.id);

    const replayMoves = this.txs.slice(0, clamped);

    for (let tx of replayMoves) {
      this.game_mod.game.future.push(
        tx.serialize_to_web ? tx.serialize_to_web(this.app) : tx
      );
    }

    while (true) {
      if (this.game_mod.processFutureMoves()) {
        await this.game_mod.runQueue();
        continue;
      }
      break;
    }

    this.index_current = clamped;

    if (this.hud?.setPosition) {
      this.hud.setPosition(this.index_current);
    }

    this.loader.remove();
    this.hud.updateStatus(`Paused at move ${this.index_current}`);

  }

  startPlayback() {

    if (!this.txs || this.txs.length === 0) {
      return;
    }

    this.playback_status = "playing";

    if (this.index_current < this.txs.length) {
      this.buffer = this.txs.slice(this.index_current);
    }

    if (this.hud && this.hud.updateStatus) {
      this.hud.updateStatus("Playing...");
    }

  }

}

module.exports = GameObserver;
