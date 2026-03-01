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
    this.arcade_mod = null;

    this.isObserverView = false;
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('observer') === '1') {
        this.isObserverView = true;
      }
    }

    this.step_speed = 2000;
    this._paused = true;

    this.is_loading = true;
    this._engine_game_states = []; // engine pushes here via .game_states getter; observer logic uses all_moves only
    this.game_moves = [];
    this.all_moves = []; // canonical move list: authoritative for step counts and slider; only grows when new moves arrive from network, never during replay
    this.baseline_state = null; // post-READY snapshot for deterministic replay
    this.future_moves = [];

    this.is_syncing = false;
    this.total_moves_expected = 0;
    this.moves_processed = 0;

    this._viewingIndex = 0;
    this._stepSpeedBeforeSync = undefined;

    this.current_index = 0;
    this.total_moves = 0;
    this.follow_live = true;
    this.is_playing = false;
    this.base_game_state = null;
    this.is_replaying = false; // true while replayToIndex is running; prevents syncing duplicates into all_moves

    // configurable slider resolution
    this.max_slider_stops = 20;

    this.sync_phase = 'connecting';
    this._lastKnownStatesLength = 0;
    this.sync_in_progress = false;
    this.replay_active = false;
    this.stability_monitor_active = false;
    this._sync_stability_interval = null;
    this._observer_overlay_start_time = null;
    this._overlay_removal_scheduled = false;
    this._history_complete = true;

    this.loader = new GameObserverLoader(app, game_mod, '');
    this._hudContext = {
      getState: () => ({
        totalMoves: this.all_moves.length,
        viewingIndex: this._viewingIndex,
        isPaused: this.is_paused
      }),
      onBack: () => {
        this.showNextMoveButton();
        this.last();
      },
      onPlay: () => {
        this.step_speed = 2000;
        if (this.is_paused) this.play();
        else this.pause();
      },
      onForward: () => {
        if (!this.is_paused) {
          this.step_speed /= 2;
          return;
        }
        this.next();
      },
      onSliderInput: (idx) => this.replayToIndex(idx),
      observer: this
    };
    this.hud = new GameObserverHUD(app, this._hudContext, '');
  }

  get is_paused() {
    return this._paused;
  }

  /** Engine expects this array for push/shift; observer logic does not use it. */
  get game_states() {
    return this._engine_game_states || (this._engine_game_states = []);
  }

  /** Clamp _viewingIndex to [0, all_moves.length - 1]. */
  _clampViewingIndex() {
    const max = Math.max(0, this.all_moves.length - 1);
    this._viewingIndex = Math.max(0, Math.min(this._viewingIndex, max));
  }

  /**
   * Render the Observer interface into document.body. Loader renders only once during loading;
   * if overlay already exists and is_loading, do nothing to avoid duplicate re-renders.
   */
  render() {
    if (typeof document === 'undefined' || !document.body) return;

    if (this.is_loading) {
      const overlayEl = document.body.querySelector('#observer-sync-overlay');
      if (overlayEl) return;
      const hudEl = document.body.querySelector('#game-observer-hud');
      if (hudEl) hudEl.remove();
      this._observer_overlay_start_time = Date.now();
      this.loader.render();
    } else {
      this.hud.render();
      this.hud.attachEvents();
      this.hud.updateUIState();
    }
  }

  hide() {
    this.hud.hide();
  }

  remove() {
    this.hud.remove();
  }

  updateSyncStatus(message) {
    this.loader.updateSyncStatus(message);
  }

  updateStatus(str) {
    try {
      const sanitized = typeof sanitize === 'function' ? sanitize(str) : str;
      this.hud.updateStatus(sanitized);
      setTimeout(() => {
        this.hud.updateStatus(this.game_mod.game.status);
      }, 1500);
    } catch (err) {
      console.error(err);
    }
  }

  finishLoading() {
    if (!this.is_loading) return;
    if (this._overlay_removal_scheduled) return;
    this._overlay_removal_scheduled = true;

    const MIN_VISIBLE_MS = 2000;
    const elapsed = (this._observer_overlay_start_time != null)
      ? Date.now() - this._observer_overlay_start_time
      : MIN_VISIBLE_MS;
    const delayMs = Math.max(0, MIN_VISIBLE_MS - elapsed);

    this.sync_phase = 'ready';
    this.replay_active = false;
    this.stability_monitor_active = false;
    this.is_loading = false;

    if (this._sync_stability_interval != null) {
      clearInterval(this._sync_stability_interval);
      this._sync_stability_interval = null;
    }

    const engineStep = this.game_mod?.game?.step?.game || 0;
    if (engineStep > 0 && this.all_moves.length === 0) {
      this.all_moves.length = engineStep;
      this._viewingIndex = engineStep - 1;
      this._history_complete = false;
    }

    const total = this.all_moves.length;
    if (total > 0) {
      if (this.game_mod.game?.over === 1) {
        this._viewingIndex = 0;
        this.is_playing = false;
        this._paused = true;
      } else {
        this._viewingIndex = total - 1;
        this.is_playing = true;
        this._paused = false;
      }
    } else {
      this._viewingIndex = 0;
    }

    if (this.game_mod.observer_watch_live === true || this.follow_live === true || this.game_mod.game?.live === true) {
      this._paused = false;
      this.is_playing = true;
    }

    this._clampViewingIndex();
    if (this.all_moves.length > 0 && !this.baseline_state && this._engine_game_states && this._engine_game_states.length > 0) {
      this.baseline_state = JSON.parse(JSON.stringify(this._engine_game_states[0]));
    }

    this.hud.render();
    this.hud.attachEvents();
    this.hud.updateUIState();

    setTimeout(() => {
      const overlayEl = document.body.querySelector('#observer-sync-overlay');
      if (overlayEl) overlayEl.remove();
      if (this.game_mod.observer_watch_live) {
        this.game_mod.sendMetaMessage('FOLLOW');
      }
    }, delayMs);
  }

  /**
   * Reset to READY baseline and replay moves 0..targetIndex deterministically.
   * Does not call saveGame. Updates _viewingIndex and UI after execution.
   * Preserves moves beyond targetIndex (and any engine future) so they are restored after replay.
   */
  async replayToIndex(targetIndex) {
    this.is_playing = false;
    if (!this.baseline_state) return;

    const maxIndex = Math.max(0, this.all_moves.length - 1);
    const clamped = Math.max(0, Math.min(targetIndex, maxIndex));

    // Store future beyond target so we never permanently delete canonical moves; new moves arriving during rewind remain accessible
    const futureBeyondTarget = [];
    for (let i = clamped + 1; i < this.all_moves.length; i++) {
      const tx = this.all_moves[i];
      if (tx && typeof tx.serialize_to_web === 'function') {
        futureBeyondTarget.push(tx.serialize_to_web(this.app));
      }
    }
    const storedEngineFuture = (this.game_mod.game?.future && this.game_mod.game.future.length)
      ? this.game_mod.game.future.slice()
      : [];

    this.is_replaying = true;

    this.game_mod.game = JSON.parse(JSON.stringify(this.baseline_state));
    this.game_mod.game.queue = [];
    this.game_mod.game.future = [];

    for (let i = 0; i <= clamped && i < this.all_moves.length; i++) {
      const tx = this.all_moves[i];
      if (tx && typeof tx.serialize_to_web === 'function') {
        this.game_mod.game.future.push(tx.serialize_to_web(this.app));
      }
    }

    if (!this.game_mod.game.future) this.game_mod.game.future = [];

    if (this.app.options && this.app.options.games) {
      for (let i = 0; i < this.app.options.games.length; i++) {
        if (this.app.options.games[i].id === this.game_mod.game.id) {
          if (this.app.options.games[i].future === undefined) {
            this.app.options.games[i].future = [];
          }
          break;
        }
      }
    }

    await this.game_mod.startQueue();

    this.is_replaying = false;

    // Restore moves beyond targetIndex so canonical moves and new arrivals remain accessible
    this.game_mod.game.future = futureBeyondTarget.slice();
    for (const mv of storedEngineFuture) {
      const key = JSON.stringify(mv);
      if (!this.game_mod.game.future.some((f) => JSON.stringify(f) === key)) {
        this.game_mod.game.future.push(mv);
      }
    }

    this._viewingIndex = clamped;
    this._clampViewingIndex();
    this.hud.updateUIState();

    this.game_mod.game.status = `Paused at move ${this._viewingIndex + 1}. Click Play to continue.`;
  }

  updateStep(step) {
    // Canonical append: only when engine just added a move (addNextMove → updateStep) and not replaying
    if (!this.is_replaying && this.game_moves.length > 0) {
      this.all_moves.push(this.game_moves[this.game_moves.length - 1]);
    }
    console.log('updateStep:', {
      is_replaying: this.is_replaying,
      game_moves_length: this.game_moves.length,
      all_moves_length: this.all_moves.length
    });
    const prevLen = this._lastKnownStatesLength ?? 0;
    const total = this.all_moves.length;
    if (total > prevLen && this.is_playing && this._viewingIndex === prevLen - 1) {
      this._viewingIndex = total - 1;
    }
    this._lastKnownStatesLength = total;

    const wasAtEnd = this._viewingIndex === total - 2;
    if (this.is_playing && wasAtEnd) {
      this._viewingIndex = total - 1;
    }
    this._clampViewingIndex();
    this.hud.updateUIState();

    this.moves_processed = typeof step === 'number' ? step : parseInt(step, 10) || 0;
    if (total > 0) {
      if (this.sync_phase === 'connecting') this.sync_phase = 'validating';
      const totalExpected = this.total_moves_expected || total;
      this.updateSyncStatus('Validating move ' + total + ' of ' + totalExpected);
    }
    if (this.is_loading) {
      this.updateSyncStatus('Validating moves ' + total + '...');
    }
    if (this.total_moves_expected > 0) {
      console.log('[GameObserver] progress: moves_processed=', this.moves_processed, 'total_moves_expected=', this.total_moves_expected);
    } else {
      console.log('[GameObserver] updateStep: moves_processed=', this.moves_processed);
    }
  }

  pause() {
    this._paused = true;
    this.hud.updateUIState();
  }

  resume() {
    this._paused = false;
    this.updateStatus('Replaying moves...');
    this.hud.updateUIState();
  }

  /**
   * Resume deterministic forward execution.
   * If behind latest: replay to last move then enable auto-advance.
   * If already at latest: just enable auto-advance for new moves.
   */
  async play() {
    if (this.all_moves.length > 0 && this._viewingIndex < this.all_moves.length - 1) {
      await this.replayToIndex(this.all_moves.length - 1);
    }
    this.is_playing = true;
    this.resume();
    console.log('OBSERVER: unhalt game (play)');
  }

  insertFutureMoves(game_mod) {
    for (let i = 0; i < this.future_moves.length; i++) {
      let future_tx = this.future_moves[i];
      game_mod.addFutureMove(future_tx);
    }
    this.future_moves = [];
  }

  /**
   * Move forward one step (replay from baseline to target index).
   * Only replays when paused; at end does nothing.
   */
  next() {
    if (this._viewingIndex >= this.all_moves.length - 1) return;
    if (this.is_paused) {
      this.replayToIndex(this._viewingIndex + 1);
    }
  }

  /**
   * Rewind one step (replay from baseline to target index).
   * Exits play mode via replayToIndex (is_playing = false).
   */
  last() {
    if (this._viewingIndex <= 0) return;
    const newIndex = this._viewingIndex - 1;
    this.replayToIndex(newIndex);
  }

  hideNextMoveButton() {
    this.hud.hideNextMoveButton();
  }

  showNextMoveButton() {
    this.hud.showNextMoveButton();
  }

  showLastMoveButton() {
    this.hud.updateUIState();
  }

  /**
   * Lazy canonical reconstruction: when _history_complete is false and user rewinds,
   * clear all_moves, re-fetch from archive, and run queue so finishLoading() runs normally.
   */
  async rebuildHistoryFromArchive() {
    this.is_loading = true;
    this._overlay_removal_scheduled = false;
    this._observer_overlay_start_time = Date.now();
    this.loader.render();

    this.all_moves = [];
    this._history_complete = true;

    await this.observerDownloadNextMoves(async () => {
      await this.game_mod.startQueue();
    });
  }

  /**
   * Observer-only: load next batch of moves from archive. Mutates game_mod.game.future;
   * invokes callback when done. Sync completion is determined by checkSyncStability().
   */
  async observerDownloadNextMoves(mycallback = null) {
    const g = this.game_mod.game;
    const mod = this.game_mod;

    this.replay_active = true;

    // purge old transactions
    for (let i = g.future.length - 1; i >= 0; i--) {
      let queued_tx = new Transaction();
      queued_tx.deserialize_from_web(this.app, g.future[i]);
      let queued_txmsg = queued_tx.returnMessage();

      if (
        queued_txmsg.step.game <= g.step.game &&
        queued_txmsg.step.game <= g.step.players[queued_tx.from[0].publicKey]
      ) {
        console.info(
          'GT [observer] Trimming future move to download new ones:',
          JSON.parse(JSON.stringify(queued_txmsg))
        );
        g.future.splice(i, 1);
      }
    }

    if (!mod.archive_connected) {
      console.warn("GT [observer] Haven't established peer yet, try again after 3s");
      setTimeout(() => {
        this.observerDownloadNextMoves(mycallback);
      }, 3000);
      return null;
    }

    let currentStep = String(g.step.game).padStart(5, '0');

    console.info(
      `GT [observer] Load game moves from archive: ${mod.name}_${g.id} from ${g.originator} after ${currentStep}`
    );

    this.sync_in_progress = true;
    return this.app.storage.loadTransactions(
      {
        field1: mod.name,
        field4: g.id,
        field5: currentStep,
        ascending: 1,
        limit: 20,
        field5_sort: 1
      },
      async (txs) => {
        this.sync_in_progress = false;
        let new_moves = 0;

        for (let tx of txs) {
          let game_move = tx.returnMessage();

          if (game_move?.step && game_move.request == 'game') {
            let loaded_step = game_move.step.game;

            if (
              loaded_step > g.step.game ||
              loaded_step > g.step.players[tx.from[0].publicKey]
            ) {
              let ftx = tx.serialize_to_web(this.app);

              if (!g.future.includes(ftx)) {
                g.future.push(ftx);
                new_moves++;
              }
            }
          } else {
            console.warn('GT [observer] Non game move: ', game_move);

            let rtx = new Transaction();
            rtx.msg.module = 'Relay';
            rtx.msg.request = 'game relay update';
            rtx.msg.data = tx.toJson();

            if (!g.futurePlus) {
              g.futurePlus = {};
            }

            g.futurePlus[game_move.step] = rtx;
          }
        }

        console.info(
          `GT [observer] Found ${new_moves} future moves in archives. Initializing? `,
          g.initializing
        );

        mod.saveFutureMoves(g.id);
        mod.saveGame(g.id);

        if (new_moves == 0) {
          this.updateSyncStatus("No moves found in game archive.");
        }

        if (mycallback) {
          if (new_moves !== 0 || !(g.player == 0 && mod.gameBrowserActive())) {
            console.debug('GT [observer] Run callback after fetching archives...');
            mycallback();
          } else {
            // Observer with 0 new moves:
            // Unblock queue so next live move can trigger startQueue()
            mod.gaming_active = 0;
          }
        }

        this.checkSyncStability();
      }
    );
  }

  /**
   * Poll every 100ms. Engine-ready when sync_in_progress is false and queue/future lengths
   * are stable (unchanged) for >= 1000ms. Does NOT require queue or future to be empty.
   */
  checkSyncStability() {
    if (!this.is_loading || !this.game_mod?.game) return;
    if (this._sync_stability_interval != null) return;
    const self = this;
    const CHECK_MS = 100;
    const STABLE_MS = 1000;
    let lastQLen;
    let lastFLen;
    let stableSince = null;
    this.stability_monitor_active = true;
    this._sync_stability_interval = setInterval(() => {
      if (!self.is_loading || !self.game_mod?.game) {
        if (self._sync_stability_interval != null) {
          clearInterval(self._sync_stability_interval);
          self._sync_stability_interval = null;
        }
        self.stability_monitor_active = false;
        return;
      }
      const qLen = self.game_mod.game.queue?.length || 0;
      const fLen = self.game_mod.game.future?.length || 0;
      const now = Date.now();

      if (self.sync_in_progress) {
        stableSince = null;
      } else {
        if (qLen === lastQLen && fLen === lastFLen) {
          if (stableSince == null) stableSince = now;
          if (now - stableSince >= STABLE_MS) {
            if (self._sync_stability_interval != null) {
              clearInterval(self._sync_stability_interval);
              self._sync_stability_interval = null;
            }
            self.stability_monitor_active = false;
            self.finishLoading();
          }
        } else {
          stableSince = null;
          lastQLen = qLen;
          lastFLen = fLen;
        }
      }
    }, CHECK_MS);
  }
}

module.exports = GameObserver;
