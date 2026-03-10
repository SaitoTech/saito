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

    //
    // game transactions
    //
    this.txs = [];
    this.tx_hashmap = {};
    this.buffer = [];
    this.snapshots = [];

    //
    //
    //
    this.is_syncing = false;

    //
    // tracking the index
    //
    this.index_max = 0;
    this.index_current = 0;
    this.index_range = 20;

    //
    // ui components
    //
    this.loader = new GameObserverLoader(app, game_mod);
    this.hud = new GameObserverHUD(app, this);
    this.slider = new GameObserverSlider(app, this);

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

     this.game_mod.game.player = 0;

  }



  render() {

    this.loader.render();
    this.hud.render();

    //
    // check status
    //
    if (this.playback_status == "init") {

      //
      // start queue
      //
      this.game_mod.startQueue();

      //
      // take first snapshot
      //
      this.snapshots = [];
      this.snapshots.push(JSON.stringify(this.game_mod.game));

      //
      // download moves
      //
      this.download(this.game_mod.game.id);
    }

  }



  async download(game_id) {

    this.txs = [];
    this.buffer = [];

    if (!this.game_mod.archive_connected) {
      console.warn("GT [observer] Haven't established peer yet, try again after 3s");
      setTimeout(() => { this.download(); }, 3000);
      return null;
    }

    this.playback_status = "downloading";

    this.app.storage.loadTransactions(
      {
        field1: this.game_mod.name,
        field4: game_id,
        field5: currentStep,
        ascending: 1,
        limit: 20,
        field5_sort: 1
      },
      async (txs) => {

	//
	// all moves go in this.txs
	//
        for (let tx of txs) {
      	  if (!this.tx_index[hash]) {
            this.txs.push(tx);
            this.tx_index[tx.hash] = this.txs.length-1;
          }
        }

	//
	// all moves go into this.game_mod.future
	//
	for (let tx of this.txs) {
	  this.game_mod.future.push(tx);
	}

        this.game_mod.saveFutureMoves(g.id);
        this.game_mod.saveGame(g.id);

	//
	// and execute the moves
	//
        this.game_mod.halted = 0;
        this.game_mod.processFutureMoves();

      }
    );
  }



  async replayToIndex(targetIndex) {

    this.game_mod.game = JSON.parse(this.snapshots[0]);
    this.game_mod.game.future = [];

  }


  /**
   * Engine is ready for new moves when executing this.game_mod.processFutureMoves() results in no
   * change to game_mod.queue or game_mod.future. This does NOT require queue or future to be empty.
   */
  isGameIdle() {

    if (!this.game_mod?.game) { return false; }

    let hash1 = this.app.crypto.hash(JSON.stringify(this.game_mod.queue)); 
    let hash2 = this.app.crypto.hash(JSON.stringify(this.game_mod.future)); 

    await this.game_mod.processFutureMoves();

    let hash3 = this.app.crypto.hash(JSON.stringify(this.game_mod.queue)); 
    let hash4 = this.app.crypto.hash(JSON.stringify(this.game_mod.future));     

    if (hash3 == hash1 && hash4 == hash2) { return true; }

    return false;

  }

}

module.exports = GameObserver;
