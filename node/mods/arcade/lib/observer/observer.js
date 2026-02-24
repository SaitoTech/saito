"use strict";

/**
 * ArcadeObserver – replay/step-through controls for game state.
 * Fetches full game history from archive, reconstructs state deterministically,
 * then enables observer controls.
 */

class ArcadeObserver {
  constructor(app, arcade_mod, game_mod, game_id) {
    this.app = app;
    this.arcade_mod = arcade_mod;
    this.game_mod = game_mod;
    this.game_id = game_id;
    this.initial_state = null;
    this.moves = [];
    this.step_current = 0;
    this.step_max = 0;
    this.is_reconstructing = false;
    this.is_playing = false;
    this.timer = null;
    this.final_state = null;

    this._container = null;
    this._loadingContainer = null;
    this._template = null;
  }

  /**
   * Stub: apply a single transaction (move) to state for deterministic replay.
   * TODO: Integrate with game_mod so each tx is applied by the game engine;
   * for now state is returned unchanged.
   */
  applyMoveToState(state, tx) {
    // TODO: Deterministic replay – game_mod should apply this tx to state
    // (e.g. game_mod.applyReplayMove(state, tx)) and return updated state.
    return state;
  }

  /**
   * Fetch all archive transactions for this game.
   * Uses existing storage pattern: field1 = module_gameid (same as Arcade archive).
   * Paginates with limit until no more results.
   */
  async fetchAllGameTransactions() {
    const query = this.game_mod.name + "_" + this.game_id;
    const all = [];
    const seen = new Set();
    const limit = 500;
    let afterStep = null;

    while (true) {
      const q = { field1: query, field5_sort: 1, ascending: 1, limit };
      if (afterStep != null) {
        q.field5 = String(afterStep).padStart(5, "0");
      }
      const txs = await new Promise((resolve) => {
        this.app.storage.loadTransactions(q, (r) => resolve(r || []), "localhost");
      });
      if (!txs.length) break;
      for (const tx of txs) {
        const msg = tx.returnMessage ? tx.returnMessage() : tx.msg;
        if (!msg || msg.module !== this.game_mod.name || msg.game_id !== this.game_id) continue;
        if (seen.has(tx.signature)) continue;
        seen.add(tx.signature);
        all.push(tx);
      }
      if (txs.length < limit) break;
      const last = txs[txs.length - 1];
      const lastMsg = last.returnMessage ? last.returnMessage() : last.msg;
      const step = lastMsg?.step?.game ?? lastMsg?.step ?? null;
      if (step == null) break;
      afterStep = (typeof step === "number" ? step : parseInt(step, 10)) + 1;
    }
    return all;
  }

  /**
   * Show full-screen loading overlay (reconstructing game).
   */
  _renderLoadingOverlay() {
    const template = this._getTemplate();
    const renderLoading = typeof template.renderLoading === "function" ? template.renderLoading : null;
    if (!renderLoading) return;
    if (!this._loadingContainer) {
      this._loadingContainer = document.createElement("div");
      this._loadingContainer.className = "arcade-observer-loading-mount";
      document.body.appendChild(this._loadingContainer);
    }
    this._loadingContainer.innerHTML = renderLoading();
  }

  /**
   * Remove loading overlay.
   */
  _removeLoadingOverlay() {
    if (this._loadingContainer && this._loadingContainer.parentNode) {
      this._loadingContainer.parentNode.removeChild(this._loadingContainer);
    }
    this._loadingContainer = null;
  }

  /**
   * Initialize observer: fetch all txs, reconstruct state, then render game and controls.
   */
  async initialize() {
    this.is_reconstructing = true;
    this._renderLoadingOverlay();

    let txs = [];
    try {
      txs = await this.fetchAllGameTransactions();
    } catch (e) {
      console.error("ArcadeObserver: fetchAllGameTransactions failed", e);
      this.is_reconstructing = false;
      this._removeLoadingOverlay();
      return;
    }

    const sorted = txs.slice().sort((a, b) => {
      const am = a.returnMessage ? a.returnMessage() : a.msg;
      const bm = b.returnMessage ? b.returnMessage() : b.msg;
      const as = am?.step?.game ?? am?.step ?? 0;
      const bs = bm?.step?.game ?? bm?.step ?? 0;
      return (Number(as) || 0) - (Number(bs) || 0);
    });

    const inviteOrShare = sorted.find((tx) => {
      const m = tx.returnMessage ? tx.returnMessage() : tx.msg;
      return m?.request === "open" || m?.request === "private" || m?.request === "accept" || (m?.request === "game" && m?.step?.game === 0) || m?.step === "SHARE" || m?.state;
    });

    if (inviteOrShare) {
      const msg = inviteOrShare.returnMessage ? inviteOrShare.returnMessage() : inviteOrShare.msg;
      if (msg?.state && typeof msg.state === "object") {
        this.initial_state = JSON.parse(JSON.stringify(msg.state));
      } else {
        // TODO: When invite does not contain full state, build empty game state
        // via game_mod (e.g. game_mod.createEmptyState(this.game_id)).
        this.initial_state = {};
      }
    } else {
      this.initial_state = {};
    }

    let state = this.initial_state == null ? null : JSON.parse(JSON.stringify(this.initial_state));
    const moveTxs = sorted.filter((tx) => {
      const m = tx.returnMessage ? tx.returnMessage() : tx.msg;
      return m?.request === "game" && (m?.step?.game > 0 || m?.step > 0);
    });

    for (const tx of moveTxs) {
      state = this.applyMoveToState(state, tx);
    }

    this.final_state = state;
    this.moves = moveTxs;
    this.step_max = moveTxs.length;
    this.step_current = this.step_max;
    this.is_reconstructing = false;
    this._removeLoadingOverlay();
    this.render();
  }

  render(step = null) {
    if (this.is_reconstructing) return;

    if (step !== null) {
      this.step_current = step;
    }
    this.step_current = Math.max(0, Math.min(this.step_current, this.step_max));

    // Recompute state from initial_state + moves[0..step_current)
    // TODO: deterministic replay – iterate moves and apply via applyMoveToState
    let state =
      this.initial_state != null ? JSON.parse(JSON.stringify(this.initial_state)) : null;
    for (let i = 0; i < this.step_current && state != null && i < this.moves.length; i++) {
      state = this.applyMoveToState(state, this.moves[i]);
    }

    if (state != null && typeof this.game_mod.renderFromState === "function") {
      this.game_mod.renderFromState(state);
    }

    const template = this._getTemplate();
    if (!this._container) {
      this._container = document.createElement("div");
      this._container.className = "arcade-observer-mount";
      document.body.appendChild(this._container);
    }
    this._container.innerHTML = typeof template === "function" ? template(this) : template(this);
    this._bindControls();
    this._updateStepIndicator();
  }

  _getTemplate() {
    if (!this._template) {
      try {
        this._template = require("./observer.template.js");
      } catch (e) {
        this._template = () => "<div class=\"arcade-observer\">No template</div>";
      }
    }
    return this._template;
  }

  _bindControls() {
    const root = this._container;
    if (!root) return;

    const startBtn = root.querySelector("#observer-start");
    const prevBtn = root.querySelector("#observer-prev");
    const playBtn = root.querySelector("#observer-play");
    const nextBtn = root.querySelector("#observer-next");
    const endBtn = root.querySelector("#observer-end");

    if (startBtn) startBtn.addEventListener("click", () => this.render(0));
    if (prevBtn) prevBtn.addEventListener("click", () => this.prev());
    if (playBtn) playBtn.addEventListener("click", () => (this.is_playing ? this.pause() : this.play()));
    if (nextBtn) nextBtn.addEventListener("click", () => this.next());
    if (endBtn) endBtn.addEventListener("click", () => this.render(this.step_max));
  }

  _updateStepIndicator() {
    const progress = this._container && this._container.querySelector(".arcade-observer-progress");
    if (progress) {
      progress.textContent = `Step ${this.step_current} / ${this.step_max}`;
    }
  }

  next() {
    if (this.step_current < this.step_max) {
      this.step_current += 1;
      this.render();
    }
  }

  prev() {
    if (this.step_current > 0) {
      this.step_current -= 1;
      this.render();
    }
  }

  play() {
    this.is_playing = true;
    const tick = () => {
      if (!this.is_playing) return;
      if (this.step_current >= this.step_max) {
        this.pause();
        return;
      }
      this.next();
      this.timer = setTimeout(tick, 1000);
    };
    tick();
  }

  pause() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.is_playing = false;
  }

  destroy() {
    this.pause();
    this._removeLoadingOverlay();
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
  }
}

module.exports = ArcadeObserver;
