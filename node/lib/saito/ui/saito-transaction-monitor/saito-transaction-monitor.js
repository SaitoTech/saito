const SaitoOverlay = require('../saito-overlay/saito-overlay');
const Template = require('./saito-transaction-monitor.template');

class SaitoTransactionMonitor {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.clickBackdropToClose = false;

    this.tx = null;
    this.callback = null;
    this.options = {};
    this._countdown_timer = null;
    // Set when confirmation is detected; delivered when the completion UI is dismissed.
    this._completion_result = null;

    // Invalidates in-flight recent-block lookups after cancel / re-render / complete.
    this._watch_generation = 0;
    this._reconcile_in_flight = 0;
    this._recent_block_lookback = 6;
    this._reconcile_every_ticks = 3;

    //
    // wrap onConfirmation
    //
    if (mod && typeof mod.onConfirmation === 'function') {
      const existing = mod.onConfirmation.bind(mod);
      mod.onConfirmation = async (...args) => {
        this.onConfirmation(...args);
        return await existing(...args);
      };
    }
  }

  /**
   * Begin watching a transaction and show the waiting UI.
   *
   * options:
   *   tx                 - transaction to monitor
   *   callback           - fired when the monitor finishes:
   *                        { status: 'confirmed' } after the user dismisses
   *                        the completion dialog, or { status: 'cancelled' }
   *                        if they close while still waiting
   *   title / lead / subtitle
   *   successTitle / successLead / successActionLabel
   *   auto_continue_on_confirm - if true, skip the completion dialog and fire
   *                        the confirmed callback as soon as the tx confirms
   */
  render(options = {}) {
    this._watch_generation += 1;
    this.stopCountdown();

    this.options = options;
    this.tx = options.tx || null;
    this.callback = typeof options.callback === 'function' ? options.callback : null;
    this._completion_result = null;

    this.overlay.clickBackdropToClose = false;
    this.overlay.show(
      Template.pending({
        title: options.title || 'Waiting for Confirmation',
        lead: options.lead || 'Your transaction has been broadcast to the Saito network.',
        subtitle: options.subtitle || 'It will become visible once included in a block.'
      }),
      () => {
        this.onOverlayClosed();
      }
    );

    this.startCountdown();

    // Safety net: the conf=0 callback is one-shot and may already have fired.
    const generation = this._watch_generation;
    void this.reconcileIfAlreadyConfirmed(generation);
  }

  attachEvents() {
    const btn = document.querySelector('.saito-transaction-monitor [data-action="continue"]');
    if (!btn) {
      return;
    }

    btn.onclick = (e) => {
      e.preventDefault();
      this.hide();
    };
  }

  onConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return;
    }
    this.completeWith(blk, tx);
  }

  /**
   * Shared completion for the live confirmation callback and the recent-block
   * reconciliation check. No-ops if this watch is no longer pending.
   */
  completeWith(blk, tx) {
    if (!this.tx) {
      return;
    }
    if (!tx || tx.signature !== this.tx.signature) {
      return;
    }
    if (this._completion_result) {
      return;
    }

    this._watch_generation += 1;
    this.stopCountdown();

    let txOrdinal = null;
    const blockTxs = Array.isArray(blk?.transactions) ? blk.transactions : [];
    if (tx?.signature && blockTxs.length) {
      const idx = blockTxs.findIndex((candidate) => candidate?.signature === tx.signature);
      if (idx >= 0) {
        txOrdinal = idx;
      }
    }

    this._completion_result = {
      status: 'confirmed',
      tx,
      signature: tx.signature,
      blockId: blk?.id != null ? String(blk.id) : null,
      txOrdinal: txOrdinal != null ? String(txOrdinal) : null,
      blk
    };
    this.tx = null;

    if (this.options.auto_continue_on_confirm) {
      const result = this._completion_result;
      this._completion_result = null;
      this.fireCallback(result);
      this.overlay.close();
      return;
    }

    this.overlay.clickBackdropToClose = true;
    this.overlay.show(
      Template.complete({
        title: this.options.successTitle || 'Confirmed',
        lead: this.options.successLead || '',
        actionLabel: this.options.successActionLabel || 'Continue'
      }),
      () => {
        this.onOverlayClosed();
      }
    );
    this.attachEvents();
  }

  hide() {
    this.stopCountdown();
    this.overlay.close();
  }

  onOverlayClosed() {
    this._watch_generation += 1;
    this.stopCountdown();

    if (this._completion_result) {
      // User dismissed the completion dialog (Continue / close / backdrop).
      const result = this._completion_result;
      this._completion_result = null;
      this.fireCallback(result);
    } else if (typeof this.callback === 'function') {
      // User closed while still waiting for confirmation.
      this.fireCallback({ status: 'cancelled' });
    }

    this.tx = null;
    this.callback = null;
    this.options = {};
    this._completion_result = null;
    this.overlay.clickBackdropToClose = false;
  }

  fireCallback(result) {
    if (typeof this.callback !== 'function') {
      return;
    }
    const cb = this.callback;
    this.callback = null;
    cb(result);
  }

  /**
   * If the watched transaction is already in a recent longest-chain block,
   * complete through the same path as onConfirmation. Ignores results after
   * cancel, re-render, or a competing completion.
   */
  async reconcileIfAlreadyConfirmed(generation) {
    if (generation !== this._watch_generation) {
      return;
    }
    if (!this.tx) {
      return;
    }
    if (this._reconcile_in_flight === generation) {
      return;
    }

    this._reconcile_in_flight = generation;
    try {
      const found = await this.findWatchedTransactionInRecentBlocks();
      if (generation !== this._watch_generation) {
        return;
      }
      if (!found || !this.tx) {
        return;
      }
      if (found.tx.signature !== this.tx.signature) {
        return;
      }
      this.completeWith(found.blk, found.tx);
    } catch (_err) {
      // Keep waiting — live onConfirmation remains the primary path.
    } finally {
      if (this._reconcile_in_flight === generation) {
        this._reconcile_in_flight = 0;
      }
    }
  }

  /**
   * Look for the watched signature in the most recent longest-chain blocks.
   * Presence there is the same fact conf=0 reports. SPV / empty-signature
   * bodies are skipped so they cannot false-complete the monitor.
   */
  async findWatchedTransactionInRecentBlocks() {
    const signature = this.tx?.signature;
    if (!signature) {
      return null;
    }

    const blockchain = this.app?.blockchain;
    if (!blockchain || typeof blockchain.getLatestBlockId !== 'function') {
      return null;
    }

    let latestId = 0;
    try {
      latestId = Number(await blockchain.getLatestBlockId());
    } catch (_err) {
      return null;
    }
    if (!Number.isFinite(latestId) || latestId <= 0) {
      return null;
    }

    const startId = Math.max(1, latestId - this._recent_block_lookback + 1);

    for (let id = latestId; id >= startId; id--) {
      if (!this.tx || this.tx.signature !== signature) {
        return null;
      }

      let hash = '';
      try {
        if (typeof blockchain.getLongestChainHashAtId === 'function') {
          hash = await blockchain.getLongestChainHashAtId(id);
        }
      } catch (_err) {
        continue;
      }
      if (!hash) {
        continue;
      }

      let block = null;
      if (typeof blockchain.loadBlockAsync === 'function') {
        try {
          block = await blockchain.loadBlockAsync(String(hash));
        } catch (_err) {
          block = null;
        }
      }
      if (!block && typeof blockchain.getBlock === 'function') {
        try {
          block = await blockchain.getBlock(String(hash));
        } catch (_err) {
          block = null;
        }
      }
      if (!block) {
        continue;
      }

      const txs = Array.isArray(block.transactions) ? block.transactions : [];
      if (!txs.length) {
        continue;
      }
      const looksSpv = txs.every((candidate) => !candidate?.signature);
      if (looksSpv) {
        continue;
      }

      const found = txs.find((candidate) => candidate?.signature === signature);
      if (found) {
        return { blk: block, tx: found };
      }
    }

    return null;
  }

  startCountdown() {
    this.stopCountdown();

    // Consensus timing lives in options (no blockchain getter).
    // Block production window is 2 × heartbeat (same rule as burn-fee readiness).
    const heartbeatMs = this.getHeartbeatIntervalMs();
    const blockWindowSeconds = Math.max(1, Math.round((2 * heartbeatMs) / 1000));
    const generation = this._watch_generation;

    // First paint: remaining time in the current production window.
    let seconds = this.getSecondsUntilNextBlockWindow(blockWindowSeconds);
    let ticks = 0;

    const renderSeconds = () => {
      const el =
        typeof document !== 'undefined'
          ? document.querySelector('.saito-transaction-monitor .countdown')
          : null;
      if (el) {
        el.textContent = String(seconds);
      }
    };

    renderSeconds();

    this._countdown_timer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        // Missed this window — always restart a full 2×heartbeat cycle.
        // Do not reuse the initial partial "time until next block" remaining.
        seconds = blockWindowSeconds;
      }
      renderSeconds();

      ticks += 1;
      if (this.tx && ticks % this._reconcile_every_ticks === 0) {
        void this.reconcileIfAlreadyConfirmed(generation);
      }
    }, 1000);
  }

  /**
   * Heartbeat interval in milliseconds from consensus options.
   */
  getHeartbeatIntervalMs() {
    const raw = Number(this.app?.options?.consensus?.heartbeat_interval);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 30000;
    }
    // Values below 1000 are almost certainly seconds, not milliseconds.
    if (raw < 1000) {
      return Math.round(raw * 1000);
    }
    return Math.round(raw);
  }

  /**
   * Seconds remaining until the end of the current 2×heartbeat production window
   * measured from the last block timestamp.
   */
  getSecondsUntilNextBlockWindow(blockWindowSeconds) {
    const lastTs = Number(this.app?.options?.blockchain?.last_timestamp || 0);
    if (!Number.isFinite(lastTs) || lastTs <= 0) {
      return blockWindowSeconds;
    }

    const elapsedSec = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
    const intoWindow = elapsedSec % blockWindowSeconds;
    if (elapsedSec > 0 && intoWindow === 0) {
      // Exactly on a window boundary — start a fresh full cycle.
      return blockWindowSeconds;
    }
    const remaining = blockWindowSeconds - intoWindow;
    return remaining > 0 ? remaining : blockWindowSeconds;
  }

  stopCountdown() {
    if (this._countdown_timer) {
      clearInterval(this._countdown_timer);
      this._countdown_timer = null;
    }
  }
}

module.exports = SaitoTransactionMonitor;
