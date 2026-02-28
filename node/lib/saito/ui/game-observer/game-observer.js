const GameObserverTemplate = require('./game-observer.template');
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
    this._draggable_initialized = false;
    this.sync_in_progress = false;
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

  _updateViewingLabel() {
    const label = document.getElementById('game-observer-viewing-label');
    if (!label) return;
    const total = Math.max(0, this.all_moves.length);
    const x = total === 0 ? 0 : this._viewingIndex + 1;
    label.textContent = `Viewing move ${x} of ${total}`;
  }

  _updateStateSlider() {
    const slider = document.getElementById('game-observer-state-slider');
    if (!slider) return;
    this._clampViewingIndex();
    const max = Math.max(0, this.all_moves.length - 1);
    slider.max = String(max);
    slider.value = String(this._viewingIndex);
    this._updateViewingLabel();
    this._updateDisabledState();
  }

  _onStateSliderInput() {
    const slider = document.getElementById('game-observer-state-slider');
    if (!slider) return;
    const idx = parseInt(slider.value, 10);
    if (idx < 0 || idx >= this.all_moves.length) return;

    this.replayToIndex(idx);
  }

  /**
   * Render the Observer interface
   */
  render() {
    if (!this.arcade_mod) {
      this.arcade_mod = this.app.modules.returnModule('Arcade');
      if (this.arcade_mod == null) {
        salert('ERROR 413252: Arcade Module not Installed');
        return;
      }
    }

    const html = GameObserverTemplate(this.game_mod, this.is_loading);

    if (this.is_loading) {
      const syncOverlay = document.getElementById('observer-sync-overlay');
      if (syncOverlay) {
        this.app.browser.replaceElementById(html, 'observer-sync-overlay');
      } else {
        this.app.browser.addElementToDom(html);
      }
    } else {
      const prevSync = document.getElementById('observer-sync-overlay');
      if (prevSync) prevSync.remove();
      if (!document.getElementById('game-observer-hud')) {
        this.app.browser.addElementToDom(html);
      } else {
        this.app.browser.replaceElementById(html, 'game-observer-hud');
      }
    }

    console.log('Observer DOM Audit:', document.querySelectorAll('.game-observer-controls-row').length, document.querySelectorAll('.game-observer-hud').length);

    this.attachEvents();
    this.updateUIState();
  }

  hide() {
    if (document.getElementById('game-observer-hud')) {
      document.getElementById('game-observer-hud').style.display = 'none';
    }
  }

  remove() {
    if (document.getElementById('game-observer-hud')) {
      document.getElementById('game-observer-hud').remove();
    }
  }

  updateSyncStatus(message) {
    const el = document.getElementById('observer-sync-status');
    if (el) el.innerText = message;
  }

  updateStatus(str) {
    try {
      let statusBox = document.getElementById('obstatus');
      if (statusBox) {
        statusBox.innerHTML = sanitize(str);
        setTimeout(() => {
          statusBox.innerHTML = this.game_mod.game.status;
        }, 1500);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Add functionality to the forward/rewind buttons
   */
  attachEvents() {
    let observer_self = this;
    console.log('Paused/Halted: ' + this.is_paused + ' ' + this.game_mod.halted);

    if (document.getElementById('observer-back')) {
      document.getElementById('observer-back').onclick = (e) => {
        if (e.target.closest('button').disabled) return;
        this.showNextMoveButton();
        this.last();
      };
    }

    if (document.getElementById('observer-play')) {
      const playBtn = document.getElementById('observer-play');
      playBtn.setAttribute('title', this.is_paused ? 'Resume' : 'Pause');
      playBtn.onclick = (e) => {
        console.log('GO Paused/Halted: ' + this.is_paused + ' ' + this.game_mod.halted);
        const fwdBtn = document.getElementById('observer-forward');
        if (fwdBtn) fwdBtn.classList.remove('flashit');

        this.step_speed = 2000;
        if (this.is_paused) {
          this.play();
        } else {
          this.pause();
        }
      };
    }

    if (document.getElementById('observer-forward')) {
      document.getElementById('observer-forward').onclick = (e) => {
        if (e.target.closest('button').disabled) return;
        const fwdBtn = document.getElementById('observer-forward');
        if (fwdBtn) fwdBtn.classList.remove('flashit');
        if (!this.is_paused) {
          this.step_speed /= 2;
          return;
        }
        this.next();
      };
    }

    const stateSlider = document.getElementById('game-observer-state-slider');
    if (stateSlider) {
      stateSlider.addEventListener('input', () => this._onStateSliderInput());
      this._updateStateSlider();
    }

    if (!this._draggable_initialized) {
      this.app.browser.makeDraggable('game-observer-hud');
      this._draggable_initialized = true;
    }
  }

  finishLoading() {
    if (!this.is_loading) return;

    this.sync_phase = 'ready';

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

    console.log('finishLoading:', {
      total: this.all_moves.length,
      viewingIndex: this._viewingIndex
    });
    this.is_loading = false;

    if (this.game_mod.observer_watch_live === true || this.follow_live === true || this.game_mod.game?.live === true) {
      this._paused = false;
      this.game_mod.halted = 0;
      this.is_playing = true;
    }

    this._clampViewingIndex();
    this._updateStateSlider();
    this.updateUIState();
    if (this.all_moves.length > 0 && !this.baseline_state && this._engine_game_states && this._engine_game_states.length > 0) {
      this.baseline_state = JSON.parse(JSON.stringify(this._engine_game_states[0]));
    }

    // Re-render once to switch from Loading → Ready template (defer to next frame so overlay paints before removal)
    requestAnimationFrame(() => {
      this.render();
    });

    // Live follow after archive sync: request current state from host so new moves arrive in real time
    if (this.game_mod.observer_watch_live) {
      this.game_mod.game.live = true;
      this.game_mod.expecting_state = true;
      this.game_mod.sendMetaMessage('FOLLOW');
    }
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

    this.game_mod.halted = 0;
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

    this.game_mod.game.player = 0;

    this._viewingIndex = clamped;
    this._clampViewingIndex();
    this._updateStateSlider();
    this.updateUIState();

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
    this._updateStateSlider();
    this.updateUIState();

    this.moves_processed = typeof step === 'number' ? step : parseInt(step, 10) || 0;
    if (total > 0) {
      if (this.sync_phase === 'connecting') this.sync_phase = 'validating';
      const totalExpected = this.total_moves_expected || total;
      this.updateSyncStatus('Validating move ' + total + ' of ' + totalExpected);
    }
    if (this.is_loading) {
      this.updateSyncStatus('Validating moves ' + total + '...');
    }
    if (total > 0) {
      this.finishLoading();
    }
    if (this.total_moves_expected > 0) {
      console.log('[GameObserver] progress: moves_processed=', this.moves_processed, 'total_moves_expected=', this.total_moves_expected);
    } else {
      console.log('[GameObserver] updateStep: moves_processed=', this.moves_processed);
    }
  }

  /** Reflects canonical move count only (all_moves.length). */
  updateUIState() {
    if (this.is_loading) return;

    const total = Math.max(0, this.all_moves.length);
    this._clampViewingIndex();
    const current = total === 0 ? 0 : this._viewingIndex + 1;

    const status = document.getElementById('observer-status-line');
    if (status) {
      if (total === 0) {
        status.innerHTML = 'Loading Moves...';
      } else {
        status.innerHTML = `Game Step: ${current} / ${total}`;
      }
    }

    this._updateDisabledState();
  }

  _updateDisabledState() {
    const total = this.all_moves.length;

    const backBtn = document.getElementById('observer-back');
    const fwdBtn = document.getElementById('observer-forward');

    if (backBtn) {
      backBtn.disabled = total === 0 || this._viewingIndex <= 0;
    }

    if (fwdBtn) {
      fwdBtn.disabled = total === 0 || this._viewingIndex >= total - 1;
    }
  }

  pause() {
    this._paused = true;
    this.game_mod.halted = 1;
    const playBtn = document.getElementById('observer-play');
    if (playBtn) {
      playBtn.classList.add('play-state');
      playBtn.classList.remove('pause-state');
      playBtn.setAttribute('title', 'Resume');
    }
    const fwdBtn = document.getElementById('observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.add('play-state');
      fwdBtn.classList.remove('pause-state');
    }
    this._updateDisabledState();
  }

  resume() {
    this._paused = false;
    this.game_mod.halted = 0;
    this.updateStatus('Replaying moves...');
    const playBtn = document.getElementById('observer-play');
    if (playBtn) {
      playBtn.classList.remove('play-state');
      playBtn.classList.add('pause-state');
      playBtn.setAttribute('title', 'Pause');
    }
    const fwdBtn = document.getElementById('observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.remove('play-state');
      fwdBtn.classList.add('pause-state');
    }
    this._updateDisabledState();
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
    const fwdBtn = document.getElementById('observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.remove('flashit');
      fwdBtn.disabled = true;
    }
  }

  showNextMoveButton() {
    const fwdBtn = document.getElementById('observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.add('flashit');
      this._updateDisabledState();
    }
  }

  showLastMoveButton() {
    this._updateDisabledState();
  }

  /**
   * Observer-only: load next batch of moves from archive. Mutates game_mod.game.future;
   * invokes callback when done. Sync completion is determined by checkSyncStability().
   */
  async observerDownloadNextMoves(mycallback = null) {
    const g = this.game_mod.game;
    const mod = this.game_mod;

console.log("ODNM 1");

    // purge old transactions
    for (let i = g.future.length - 1; i >= 0; i--) {
console.log("ODNM 2");
      let queued_tx = new Transaction();

console.log("ODNM 3");
      queued_tx.deserialize_from_web(this.app, g.future[i]);
console.log("ODNM 4");
      let queued_txmsg = queued_tx.returnMessage();
console.log("ODNM 5");

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
console.log("ODNM 6");
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
          if (g.initializing) {
            mod.archive_exhausted = -1;
          } else {
            mod.archive_exhausted = 1;
          }
        }

        if (mycallback && (new_moves !== 0 || !(g.player == 0 && mod.gameBrowserActive()))) {
          console.debug('GT [observer] Run callback after fetching archives...');
          mycallback();
        }
      }
    );
  }
}

module.exports = GameObserver;
