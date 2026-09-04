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
        void this.onChunkReceived();
      });
    }
  }

  async onChunkReceived() {
    const page_inhibits_overlay =
      typeof document !== 'undefined' &&
      document.body?.hasAttribute('data-inhibit-block-sync-overlay');
    const active_mod = this.app?.modules?.returnActiveModule?.();
    if (page_inhibits_overlay || active_mod?.inhibit_block_sync_overlay === true) {
      this.stopProgressPolling();
      this.cancelPendingUi();
      this.pending_transition = null;
      this.ui_mode = 'idle';
      this.syncing_shown_at = null;
      if (this.overlay.visible) {
        this.overlay.remove();
      }
      return;
    }

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

    // Skip overlay when Rust already marks a peer synced and we have a block watermark.
    try {
      const peers = await this.app?.core?.network?.getPeers?.();
      if (Array.isArray(peers)) {
        let peer_synced = false;
        for (const peer of peers) {
          const data = typeof peer.get === 'function' ? peer.get() : null;
          if (data && data.is_synced) {
            peer_synced = true;
            break;
          }
        }
        const block_id =
          this.toBigInt(this.app?.options?.blockchain?.last_block_id) ??
          this.toBigInt(this.payload?.current_block_id) ??
          0n;
        if (peer_synced && block_id > 0n) {
          this.initial_sync_completed = true;
          this.sync_complete = true;
          this.stopProgressPolling();
          this.cancelPendingUi();
          this.pending_transition = null;
          this.ui_mode = 'idle';
          this.syncing_shown_at = null;
          if (this.overlay.visible) {
            this.overlay.remove();
          }
          return;
        }
      }
    } catch (err) {
      // If peer dump is unavailable, fall through to the normal sync UI path.
    }

    const already_showing_syncing =
      this.ui_mode === 'syncing' &&
      this.overlay.visible &&
      !!document.getElementById('saito-sync') &&
      !document.querySelector('#saito-sync.saito-sync-behind');

    this.render();

    const current = this.getDisplayCurrentBlockId();
    this.applyCurrentProgress(current, already_showing_syncing);
    if (already_showing_syncing) {
      this.pulseVisual('saito-sync-beat');
    }
    this.pollLocalProgress(this.sync_generation);

    const local_id = this.toBigInt(this.payload?.latest_known_block_id);
    const payload = this.payload || {};
    const ancestor_id = this.toBigInt(payload.shared_ancestor_block_id);
    const ancestor_fields_present =
      payload.shared_ancestor_block_id != null || payload.shared_ancestor_block_hash != null;
    const no_shared_ancestor =
      ancestor_fields_present &&
      (ancestor_id == null || ancestor_id === 0n) &&
      this.isZeroBlockHash(payload.shared_ancestor_block_hash);

    if (local_id != null && local_id > 0n && no_shared_ancestor) {
      this.scheduleFastForward();
      return;
    }

    if (this.isNearTip(current, target)) {
      this.sync_complete = true;
      this.scheduleDismissSyncing();
      return;
    }

    this.cancelPendingUi();
    this.startProgressPolling();
  }

  /**
   * Currently X: live tip, never below shared_ancestor_block_id when one exists.
   */
  getDisplayCurrentBlockId(candidate) {
    const tip = this.toBigInt(
      candidate ?? this.local_current_block_id ?? this.payload?.current_block_id
    );
    const ancestor_id = this.toBigInt(this.payload?.shared_ancestor_block_id);
    if (ancestor_id == null || ancestor_id <= 0n) {
      return tip;
    }
    if (this.isZeroBlockHash(this.payload?.shared_ancestor_block_hash)) {
      return tip;
    }
    if (tip == null || tip < ancestor_id) {
      return ancestor_id;
    }
    return tip;
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

  render() {
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

    const skip = document.getElementById('saito-sync-skip');
    if (skip) {
      skip.onclick = (event) => {
        event.preventDefault();
        this.skipSyncWait();
      };
    }

    this.displayed_current_block_id = this.getDisplayCurrentBlockId();
    this.setTargetBlockText(this.toBigInt(this.payload?.target_block_id));
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

  scheduleFastForward() {
    this.pending_transition = 'fast_forward';
    this.stopProgressPolling();
    this.cancelPendingUi();
    const shown_at = this.syncing_shown_at ?? performance.now();
    const wait = Math.max(0, MIN_SYNCING_VISIBLE_MS - (performance.now() - shown_at));
    this.ui_timer = setTimeout(() => {
      this.ui_timer = null;
      this.pending_transition = null;
      this.showTooFarBehind();
    }, wait);
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

    const fill = document.getElementById('saito-sync-progress-fill');
    const bar = document.getElementById('saito-sync-progress');
    let bar_remaining_ms = PROGRESS_FILL_TRANSITION_MS;
    if (fill && bar && bar.offsetWidth > 0) {
      const current_pct = Math.min(100, (fill.offsetWidth / bar.offsetWidth) * 100);
      bar_remaining_ms = Math.ceil(((100 - Math.min(100, current_pct)) / 100) * PROGRESS_FILL_TRANSITION_MS);
    }

    const target = this.toBigInt(this.payload?.target_block_id);
    const current = this.getDisplayCurrentBlockId();
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
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fade_ms = reduced ? 0 : SYNCING_FADE_MS;
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
    const button = document.getElementById('saito-sync-fast-forward');
    if (button) {
      button.onclick = (event) => {
        event.preventDefault();
        this.fastForwardWallet();
      };
    }
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

    const target = this.toBigInt(this.payload?.target_block_id);
    if (!(this.ui_mode === 'syncing' && this.overlay.visible && target != null && target > 0n)) {
      this.stopProgressPolling();
      return;
    }

    this.poll_in_flight = true;
    try {
      let latest = null;
      try {
        const core_fn = this.app?.core?.blockchain?.get_latest_block_id;
        if (typeof core_fn === 'function') {
          latest = this.toBigInt(await core_fn.call(this.app.core.blockchain));
        } else {
          const wrapper_fn = this.app?.blockchain?.getLatestBlockId;
          if (typeof wrapper_fn === 'function') {
            latest = this.toBigInt(await wrapper_fn.call(this.app.blockchain));
          }
        }
      } catch (err) {
        latest = null;
      }

      if (generation !== this.sync_generation || this.sync_complete) {
        return;
      }
      if (this.pending_transition === 'fast_forward') {
        return;
      }
      if (latest == null) {
        return;
      }

      const display_current = this.getDisplayCurrentBlockId(latest);
      this.local_current_block_id = display_current;
      const previous = this.displayed_current_block_id;
      const changed = previous == null || display_current !== previous;
      this.applyCurrentProgress(display_current, changed);

      if (changed && previous != null) {
        this.pulseVisual('saito-sync-tick');
      }

      if (this.isNearTip(display_current, target)) {
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

  applyCurrentProgress(current, animate_number) {
    const target = this.toBigInt(this.payload?.target_block_id);
    const display_current = this.getDisplayCurrentBlockId(current);
    this.setTargetBlockText(target);

    if (animate_number) {
      this.animateCurrentBlock(this.displayed_current_block_id, display_current);
    } else {
      this.setCurrentBlockText(display_current);
    }
    this.displayed_current_block_id = display_current;
    this.setProgress(display_current, target);
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

    const to_safe = (value) => {
      const as_bigint = this.toBigInt(value);
      if (as_bigint == null) {
        return null;
      }
      if (as_bigint > BigInt(Number.MAX_SAFE_INTEGER) || as_bigint < 0n) {
        return null;
      }
      return Number(as_bigint);
    };

    const from_n = to_safe(from);
    const to_n = to_safe(to);
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
    const root = document.getElementById('saito-sync');
    const label = root ? root.querySelector('.saito-sync-progress-label') : null;
    if (label) {
      const formatted = this.formatBlockId(value);
      label.style.setProperty('--saito-sync-num-ch', String(formatted === '—' ? 4 : formatted.length));
    }
  }

  isNearTip(current, target) {
    if (current == null || target == null || target <= 0n) {
      return false;
    }
    return current >= target - NEAR_TIP_BLOCK_THRESHOLD;
  }

  setProgress(current, target) {
    const fill = document.getElementById('saito-sync-progress-fill');
    const bar = document.getElementById('saito-sync-progress');
    let percent = 0;
    if (current != null && target != null && target > 0n) {
      percent = this.isNearTip(current, target)
        ? 100
        : Number((current * 10000n) / target) / 100;
    }
    if (fill) {
      fill.style.width = `${percent}%`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
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

  formatBlockId(value) {
    const as_bigint = this.toBigInt(value);
    if (as_bigint == null) {
      return '—';
    }
    return as_bigint.toLocaleString('en-US');
  }
}

module.exports = SaitoSync;
