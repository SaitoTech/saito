const SaitoOverlay = require('../saito-overlay/saito-overlay');
const SaitoSyncTemplate = require('./saito-sync.template');

const POLL_INTERVAL_MS = 400;

// TEST ONLY:
// Temporarily force the "too far behind" template
// so the UI and FAST-FORWARD WALLET interaction can
// be developed and tested.
const FORCE_TOO_FAR_BEHIND_FOR_TESTING = true;

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

    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/saito-sync.css');
    }

    if (this.app?.connection?.on) {
      this.app.connection.on('on-blockchain-received', (payload) => {
        this.payload = payload || {};
        this.onChunkReceived();
      });
    }

    if (FORCE_TOO_FAR_BEHIND_FOR_TESTING) {
      this.showTooFarBehind();
    }
  }

  onChunkReceived() {
    if (FORCE_TOO_FAR_BEHIND_FOR_TESTING) {
      return;
    }

    const target = this.toBigInt(this.payload?.target_block_id);
    const previous_target = this.active_target_block_id;
    const new_target =
      target != null && (previous_target == null || target !== previous_target);

    if (this.sync_complete && new_target) {
      this.sync_complete = false;
      this.sync_generation += 1;
    }

    this.active_target_block_id = target;
    this.render();

    if (!this.sync_complete) {
      this.startProgressPolling();
    }
  }

  render() {
    const existing = document.getElementById('saito-sync');
    if (this.overlay.visible && existing) {
      this.updateFromChunkEvent(true);
      return;
    }

    this.overlay.show(SaitoSyncTemplate(this));
    this.attachEvents();
    this.displayed_current_block_id = this.toBigInt(
      this.local_current_block_id ?? this.payload?.current_block_id
    );
    this.updateFromChunkEvent(false);
  }

  attachEvents() {}

  showTooFarBehind() {
    this.stopProgressPolling();
    this.overlay.show(SaitoSyncTemplate.tooFarBehind(this));
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

  fastForwardWallet() {}

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
    if (this.sync_complete) {
      return false;
    }
    const target = this.toBigInt(this.payload?.target_block_id);
    return !!(this.overlay.visible && target != null && target > 0n);
  }

  async pollLocalProgress(generation) {
    if (generation !== this.sync_generation || this.sync_complete) {
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
      if (target != null && latest >= target) {
        this.sync_complete = true;
        this.stopProgressPolling();
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
    if (current >= target) {
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
