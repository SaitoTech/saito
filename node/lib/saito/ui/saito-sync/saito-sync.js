const SaitoOverlay = require('../saito-overlay/saito-overlay');
const SaitoSyncTemplate = require('./saito-sync.template');

const POLL_INTERVAL_MS = 400;
const MIN_SYNCING_VISIBLE_MS = 500;
const SYNCING_FADE_MS = 220;
/** Matches `.saito-sync-progress-fill { transition: width 0.7s ease }` in saito-sync.css */
const PROGRESS_FILL_TRANSITION_MS = 700;
/** Pause at a full bar before the overlay fades out. */
const COMPLETE_HOLD_MS = 350;
const NEAR_TIP_BLOCK_THRESHOLD = 2n;
const ZERO_BLOCK_HASH = '0'.repeat(64);

class SaitoSync {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.payload = null;
    this.displayed_current_block_id = null;
    this.local_current_block_id = null;
    this.active_target_block_id = null;
    this.sync_complete = false;
    this.sync_generation = 0;
    this.number_raf = null;
    this.beat_timer = null;
    this.poll_timer = null;
    this.poll_in_flight = false;
    this.fast_forward_in_progress = false;
    this.ui_mode = 'idle';
    this.initial_sync_completed = false;
    this.syncing_shown_at = null;
    this.ui_timer = null;
    this.fade_timer = null;
    this.pending_transition = null;

    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/saito-sync.css');
    }

    if (this.app?.connection?.on) {
      this.app.connection.on('on-blockchain-received', (payload) => {
        this.payload = payload || {};
        this.onChunkReceived();
      });
    }
  }

  onChunkReceived() {
    if (this.initial_sync_completed) {
      return;
    }

    if (this.ui_mode === 'fast_forward') {
      return;
    }

    const target = this.toBigInt(this.payload?.target_block_id);
    const previous_target = this.active_target_block_id;
    const new_target = target != null && (previous_target == null || target !== previous_target);

    if (this.sync_complete && new_target) {
      this.sync_complete = false;
      this.sync_generation += 1;
      this.cancelPendingUi();
      this.pending_transition = null;
      this.syncing_shown_at = null;
    }

    this.active_target_block_id = target;

    const already_showing_syncing =
      this.ui_mode === 'syncing' &&
      this.overlay.visible &&
      !!document.getElementById('saito-sync') &&
      !document.querySelector('#saito-sync.saito-sync-behind');

    this.showSyncingOverlay();
    this.updateFromChunkEvent(already_showing_syncing);

    if (this.shouldShowFastForward()) {
      this.scheduleFastForward();
      return;
    }

    const current = this.local_current_block_id ?? this.toBigInt(this.payload?.current_block_id);
    if (this.isNearTip(current, target)) {
      this.sync_complete = true;
      this.scheduleDismissSyncing();
      return;
    }

    this.cancelPendingUi();
    this.startProgressPolling();
  }

  showSyncingOverlay() {
    const existing = document.getElementById('saito-sync');
    const showing_syncing =
      this.overlay.visible && existing && !existing.classList.contains('saito-sync-behind');

    if (showing_syncing) {
      this.clearOverlayFade();
      this.ui_mode = 'syncing';
      if (this.syncing_shown_at == null) {
        this.syncing_shown_at = performance.now();
      }
      return;
    }

    this.cancelPendingUi();
    this.clearOverlayFade();
    this.ui_mode = 'syncing';
    this.syncing_shown_at = performance.now();
    this.overlay.show(SaitoSyncTemplate(this), () => {
      this.onOverlayClosed();
    });
    this.attachEvents();
    this.displayed_current_block_id = this.toBigInt(
      this.local_current_block_id ?? this.payload?.current_block_id
    );
    this.updateNumberWidths(this.toBigInt(this.payload?.target_block_id));
  }

  attachEvents() {
    const button = document.getElementById('saito-sync-skip');
    if (!button) {
      return;
    }
    button.onclick = (event) => {
      event.preventDefault();
      this.skipSyncWait();
    };
  }

  skipSyncWait() {
    if (this.ui_mode !== 'syncing' || !this.overlay.visible) {
      return;
    }
    this.sync_complete = true;
    this.stopProgressPolling();
    this.cancelPendingUi();
    this.pending_transition = null;
    this.fadeOutSyncing();
  }

  onOverlayClosed() {
    this.initial_sync_completed = true;
    this.stopProgressPolling();
    this.cancelPendingUi();
    this.pending_transition = null;
    this.ui_mode = 'idle';
    this.syncing_shown_at = null;
    if (this.number_raf) {
      cancelAnimationFrame(this.number_raf);
      this.number_raf = null;
    }
    if (this.beat_timer) {
      clearTimeout(this.beat_timer);
      this.beat_timer = null;
    }
  }

  shouldShowFastForward() {
    const local_id = this.toBigInt(this.payload?.latest_known_block_id);
    if (local_id == null || local_id <= 0n) {
      return false;
    }
    return this.hasNoSharedAncestor();
  }

  hasNoSharedAncestor() {
    const payload = this.payload || {};
    if (payload.shared_ancestor_block_id == null && payload.shared_ancestor_block_hash == null) {
      return false;
    }
    const ancestor_id = this.toBigInt(payload.shared_ancestor_block_id);
    const id_is_zero = ancestor_id == null || ancestor_id === 0n;
    return id_is_zero && this.isZeroBlockHash(payload.shared_ancestor_block_hash);
  }

  isZeroBlockHash(value) {
    if (value == null || value === '') {
      return true;
    }
    if (typeof value === 'string') {
      const hex = value.replace(/^0x/i, '').toLowerCase();
      return hex.length === 0 || hex === ZERO_BLOCK_HASH;
    }
    if (Array.isArray(value) || value instanceof Uint8Array) {
      return Array.from(value).every((byte) => Number(byte) === 0);
    }
    return false;
  }

  scheduleAfterMinVisible(callback) {
    this.cancelPendingUi();
    const shown_at = this.syncing_shown_at ?? performance.now();
    const elapsed = performance.now() - shown_at;
    const wait = Math.max(0, MIN_SYNCING_VISIBLE_MS - elapsed);
    this.ui_timer = setTimeout(() => {
      this.ui_timer = null;
      callback();
    }, wait);
  }

  scheduleFastForward() {
    this.pending_transition = 'fast_forward';
    this.stopProgressPolling();
    this.scheduleAfterMinVisible(() => {
      this.pending_transition = null;
      this.showTooFarBehind();
    });
  }

  scheduleDismissSyncing() {
    if (
      this.ui_mode !== 'syncing' ||
      this.initial_sync_completed ||
      this.pending_transition === 'fast_forward'
    ) {
      return;
    }
    this.pending_transition = 'dismiss';
    this.stopProgressPolling();

    // Measure how much of the bar animation is left before snapping to 100%.
    const bar_remaining_ms = this.progressBarRemainingMs();

    const target = this.toBigInt(this.payload?.target_block_id);
    const current = this.local_current_block_id ?? this.toBigInt(this.payload?.current_block_id);
    this.setProgress(current, target);
    this.setCurrentBlockText(current);
    this.setTargetBlockText(target);

    const shown_at = this.syncing_shown_at ?? performance.now();
    const min_visible_remaining = Math.max(0, MIN_SYNCING_VISIBLE_MS - (performance.now() - shown_at));
    const wait = Math.max(min_visible_remaining, bar_remaining_ms) + COMPLETE_HOLD_MS;

    this.cancelPendingUi();
    this.ui_timer = setTimeout(() => {
      this.ui_timer = null;
      if (this.ui_mode !== 'syncing' || this.initial_sync_completed) {
        this.pending_transition = null;
        return;
      }
      this.pending_transition = null;
      this.fadeOutSyncing();
    }, wait);
  }

  fadeOutSyncing() {
    if (this.ui_mode !== 'syncing' || !this.overlay.visible) {
      return;
    }

    const overlay_el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop_el = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);
    const fade_ms = this.prefersReducedMotion() ? 0 : SYNCING_FADE_MS;
    const fade_transition = fade_ms > 0 ? `opacity ${fade_ms}ms ease` : 'none';

    if (overlay_el) {
      overlay_el.style.transition = fade_transition;
      overlay_el.style.opacity = '0';
    }
    if (backdrop_el) {
      backdrop_el.style.transition = fade_transition;
      backdrop_el.style.opacity = '0';
    }

    this.fade_timer = setTimeout(() => {
      this.fade_timer = null;
      if (this.ui_mode === 'syncing') {
        this.overlay.close();
        this.ui_mode = 'idle';
        this.syncing_shown_at = null;
      }
    }, fade_ms);
  }

  prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  cancelPendingUi() {
    if (this.ui_timer) {
      clearTimeout(this.ui_timer);
      this.ui_timer = null;
    }
    if (this.fade_timer) {
      clearTimeout(this.fade_timer);
      this.fade_timer = null;
    }
    if (this.number_raf) {
      cancelAnimationFrame(this.number_raf);
      this.number_raf = null;
    }
    if (this.beat_timer) {
      clearTimeout(this.beat_timer);
      this.beat_timer = null;
    }
  }

  clearOverlayFade() {
    const overlay_el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop_el = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);
    [overlay_el, backdrop_el].forEach((el) => {
      if (!el) {
        return;
      }
      el.style.removeProperty('opacity');
      el.style.removeProperty('transition');
    });
  }

  showTooFarBehind() {
    this.stopProgressPolling();
    this.cancelPendingUi();
    this.clearOverlayFade();
    this.ui_mode = 'fast_forward';
    this.overlay.show(SaitoSyncTemplate.tooFarBehind(this), () => {
      this.onOverlayClosed();
    });
    this.attachTooFarBehindEvents();
  }

  attachTooFarBehindEvents() {
    const button = document.getElementById('saito-sync-fast-forward');
    if (!button) {
      return;
    }
    button.onclick = (event) => {
      event.preventDefault();
      this.fastForwardWallet();
    };
  }

  async fastForwardWallet() {
    if (this.fast_forward_in_progress) {
      return;
    }

    const button = document.getElementById('saito-sync-fast-forward');
    const error_el = document.getElementById('saito-sync-error');
    const wallet = this.app?.wallet;
    const blockchain = this.app?.blockchain;

    this.fast_forward_in_progress = true;
    if (error_el) {
      error_el.textContent = '';
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'FAST-FORWARDING...';
    }

    try {
      this.stopProgressPolling();

      if (!wallet?.getPrivateKey || !wallet?.getPublicKey) {
        throw new Error('capture identity: wallet key APIs unavailable');
      }

      const private_key = await wallet.getPrivateKey();
      const public_key = await wallet.getPublicKey();
      if (!private_key || !public_key) {
        throw new Error('capture identity: missing wallet identity');
      }

      if (typeof wallet.reset !== 'function') {
        throw new Error('reset wallet: wallet.reset is unavailable');
      }
      await wallet.reset(true);

      const private_key_after_reset = await wallet.getPrivateKey();
      const public_key_after_reset = await wallet.getPublicKey();
      if (private_key_after_reset !== private_key || public_key_after_reset !== public_key) {
        throw new Error('verify identity: keys changed during reset(true)');
      }

      if (typeof blockchain?.resetBlockchain !== 'function') {
        throw new Error('reset blockchain: blockchain.resetBlockchain is unavailable');
      }
      await blockchain.resetBlockchain();

      if (typeof wallet.fetchBalanceSnapshot !== 'function') {
        throw new Error('recover balance: wallet.fetchBalanceSnapshot is unavailable');
      }
      await wallet.fetchBalanceSnapshot(public_key);

      const private_key_before_save = await wallet.getPrivateKey();
      const public_key_before_save = await wallet.getPublicKey();
      if (private_key_before_save !== private_key || public_key_before_save !== public_key) {
        throw new Error('save wallet: keys changed before save');
      }

      if (typeof wallet.saveWallet !== 'function') {
        throw new Error('save wallet: wallet.saveWallet is unavailable');
      }
      await wallet.saveWallet();

      if (typeof reloadWindow === 'function') {
        reloadWindow(300);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('[SAITO SYNC] fast-forward failed:', err);
      if (error_el) {
        error_el.textContent =
          'Fast-forward failed. Your wallet identity was not changed. ' +
          (err?.message || 'Please try again.');
      }
      if (button) {
        button.disabled = false;
        button.textContent = 'FAST-FORWARD WALLET';
      }
      this.fast_forward_in_progress = false;
    }
  }

  updateFromChunkEvent(animate) {
    const payload = this.payload || {};
    const target = this.toBigInt(payload.target_block_id);
    this.setTargetBlockText(target);

    const current = this.local_current_block_id ?? this.toBigInt(payload.current_block_id);
    this.applyCurrentProgress(current, animate);
    if (animate) {
      this.pulseVisual('saito-sync-beat');
    }
    this.pollLocalProgress(this.sync_generation);
  }

  startProgressPolling() {
    if (this.poll_timer || this.sync_complete) {
      return;
    }

    const generation = this.sync_generation;
    this.poll_timer = setInterval(() => {
      this.pollLocalProgress(generation);
    }, POLL_INTERVAL_MS);
  }

  stopProgressPolling() {
    if (this.poll_timer) {
      clearInterval(this.poll_timer);
      this.poll_timer = null;
    }
  }

  isTrackingSync(generation) {
    if (generation !== this.sync_generation) {
      return false;
    }
    if (this.sync_complete || this.pending_transition === 'fast_forward') {
      return false;
    }
    const target = this.toBigInt(this.payload?.target_block_id);
    return !!(this.ui_mode === 'syncing' && this.overlay.visible && target != null && target > 0n);
  }

  async pollLocalProgress(generation) {
    if (generation !== this.sync_generation || this.sync_complete) {
      this.stopProgressPolling();
      return;
    }
    if (this.pending_transition === 'fast_forward') {
      this.stopProgressPolling();
      return;
    }
    if (this.poll_in_flight) {
      return;
    }
    if (!this.isTrackingSync(generation)) {
      this.stopProgressPolling();
      return;
    }

    this.poll_in_flight = true;
    try {
      const latest = await this.queryLocalLatestBlockId();
      if (generation !== this.sync_generation || this.sync_complete) {
        return;
      }
      if (this.pending_transition === 'fast_forward') {
        return;
      }
      if (latest == null) {
        return;
      }

      this.local_current_block_id = latest;
      const previous = this.displayed_current_block_id;
      const changed = previous == null || latest !== previous;
      this.applyCurrentProgress(latest, changed);

      if (changed && previous != null) {
        this.pulseVisual('saito-sync-tick');
      }

      const target = this.toBigInt(this.payload?.target_block_id);
      if (this.isNearTip(latest, target)) {
        if (this.initial_sync_completed || this.ui_mode !== 'syncing') {
          return;
        }
        this.sync_complete = true;
        this.stopProgressPolling();
        this.scheduleDismissSyncing();
      }
    } finally {
      this.poll_in_flight = false;
    }
  }

  async queryLocalLatestBlockId() {
    try {
      const core_fn = this.app?.core?.blockchain?.get_latest_block_id;
      if (typeof core_fn === 'function') {
        return this.toBigInt(await core_fn.call(this.app.core.blockchain));
      }
      const wrapper_fn = this.app?.blockchain?.getLatestBlockId;
      if (typeof wrapper_fn === 'function') {
        return this.toBigInt(await wrapper_fn.call(this.app.blockchain));
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  applyCurrentProgress(current, animate_number) {
    const target = this.toBigInt(this.payload?.target_block_id);
    this.setTargetBlockText(target);

    if (animate_number) {
      this.animateCurrentBlock(this.displayed_current_block_id, current);
    } else {
      this.setCurrentBlockText(current);
    }
    this.displayed_current_block_id = current;
    this.setProgress(current, target);
  }

  pulseVisual(class_name) {
    const graphic = document.querySelector('#saito-sync .saito-sync-graphic');
    const progress = document.getElementById('saito-sync-progress');
    const current = document.getElementById('saito-sync-current-block');
    const beat_els = [graphic, progress, current].filter(Boolean);

    beat_els.forEach((el) => {
      el.classList.remove('saito-sync-beat', 'saito-sync-tick');
      void el.offsetWidth;
      el.classList.add(class_name);
    });

    if (this.beat_timer) {
      clearTimeout(this.beat_timer);
    }
    this.beat_timer = setTimeout(() => {
      beat_els.forEach((el) => el.classList.remove('saito-sync-beat', 'saito-sync-tick'));
      this.beat_timer = null;
    }, 720);
  }

  animateCurrentBlock(from, to) {
    if (this.number_raf) {
      cancelAnimationFrame(this.number_raf);
      this.number_raf = null;
    }

    const from_n = this.toSafeNumber(from);
    const to_n = this.toSafeNumber(to);
    if (from_n == null || to_n == null || from_n === to_n) {
      this.setCurrentBlockText(to);
      return;
    }

    const start = performance.now();
    const duration = 420;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from_n + (to_n - from_n) * eased;
      this.setCurrentBlockText(BigInt(Math.round(value)));
      if (t < 1) {
        this.number_raf = requestAnimationFrame(tick);
      } else {
        this.number_raf = null;
        this.setCurrentBlockText(to);
      }
    };
    this.number_raf = requestAnimationFrame(tick);
  }

  setCurrentBlockText(value) {
    const el = document.getElementById('saito-sync-current-block');
    if (el) {
      el.textContent = this.formatBlockId(value);
    }
  }

  setTargetBlockText(value) {
    const el = document.getElementById('saito-sync-target-block');
    if (el) {
      el.textContent = this.formatBlockId(value);
    }
    this.updateNumberWidths(value);
  }

  updateNumberWidths(target) {
    const root = document.getElementById('saito-sync');
    const label = root ? root.querySelector('.saito-sync-progress-label') : null;
    if (!label) {
      return;
    }
    const formatted = this.formatBlockId(target);
    const width = formatted === '—' ? 4 : formatted.length;
    label.style.setProperty('--saito-sync-num-ch', String(width));
  }

  isNearTip(current, target) {
    if (current == null || target == null || target <= 0n) {
      return false;
    }
    return current >= target - NEAR_TIP_BLOCK_THRESHOLD;
  }

  /**
   * Remaining time for the progress fill to reach 100% visually (CSS width transition).
   * Reads rendered width so dismiss waits for the bar, not just the logical complete flag.
   */
  progressBarRemainingMs() {
    const fill = document.getElementById('saito-sync-progress-fill');
    const bar = document.getElementById('saito-sync-progress');
    if (!fill || !bar || bar.offsetWidth <= 0) {
      return PROGRESS_FILL_TRANSITION_MS;
    }
    const current_pct = Math.min(100, (fill.offsetWidth / bar.offsetWidth) * 100);
    const remaining_pct = Math.max(0, 100 - current_pct);
    return Math.ceil((remaining_pct / 100) * PROGRESS_FILL_TRANSITION_MS);
  }

  setProgress(current, target) {
    const fill = document.getElementById('saito-sync-progress-fill');
    const bar = document.getElementById('saito-sync-progress');
    const percent = this.progressPercent(current, target);
    if (fill) {
      fill.style.width = `${percent}%`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
  }

  progressPercent(current, target) {
    if (current == null || target == null || target <= 0n) {
      return 0;
    }
    if (this.isNearTip(current, target)) {
      return 100;
    }
    return Number((current * 10000n) / target) / 100;
  }

  toBigInt(value) {
    if (typeof value === 'bigint') {
      return value;
    }
    if (value == null || value === '') {
      return null;
    }
    try {
      return BigInt(value);
    } catch (err) {
      return null;
    }
  }

  toSafeNumber(value) {
    const as_bigint = this.toBigInt(value);
    if (as_bigint == null) {
      return null;
    }
    if (as_bigint > BigInt(Number.MAX_SAFE_INTEGER) || as_bigint < 0n) {
      return null;
    }
    return Number(as_bigint);
  }

  formatBlockId(value) {
    const as_bigint = this.toBigInt(value);
    if (as_bigint == null) {
      return '—';
    }
    return as_bigint.toLocaleString('en-US');
  }

  displayBlockId(value) {
    return this.formatBlockId(value);
  }

  displaySyncPossible(value) {
    if (value === true) {
      return 'true';
    }
    if (value === false) {
      return 'false';
    }
    if (value == null) {
      return '';
    }
    return value.toString();
  }
}

module.exports = SaitoSync;
