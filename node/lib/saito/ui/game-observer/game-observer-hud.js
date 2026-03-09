const GameObserverHUDTemplate = require('./game-observer-hud.template');

/**
 * HUD component for the game observer: controls, slider, status line only.
 * - Renders into this.container (set in constructor). If container not provided, uses document.body.
 * - Replaces existing #game-observer-hud if present. No sync, stability, or replay logic.
 *
 * @param {Object} app - Saito application (optional; used for makeDraggable).
 * @param {Object} [context={}] - { getState(), onBack(), onPlay(), onForward(), onSliderInput(index) }.
 * @param {Element|string} [container=""] - DOM element to own; if falsy, document.body.
 */
class GameObserverHUD {
  constructor(app, context = {}, container = '') {
    this.app = app || null;
    this._context = context;
    this.container = container || (typeof document !== 'undefined' ? document.body : null);
    this._eventsAttached = false;
  }

  /**
   * Insert or replace #game-observer-hud in this.container. Idempotent.
   */
  render() {
    if (!this.container || typeof document === 'undefined') return;

    const html = GameObserverHUDTemplate();
    if (!html || !html.trim()) return;

    const existing = this.container.querySelector('#game-observer-hud');
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const node = wrap.firstElementChild;
    if (!node) return;

    if (existing) {
      existing.replaceWith(node);
    } else {
      this.container.appendChild(node);
    }

    this._eventsAttached = false;
    console.log('[HUD] render');
    if (this.container.querySelector('#game-observer-hud')) {
      console.log('[HUD] visible');
    }
  }

  /**
   * Hide the HUD with display:none in this.container.
   */
  hide() {
    if (!this.container || typeof document === 'undefined') return;

    const hud = this.container.querySelector('#game-observer-hud');
    if (hud) hud.style.display = 'none';
  }

  /**
   * Remove #game-observer-hud from this.container.
   */
  remove() {
    if (!this.container || typeof document === 'undefined') return;

    const hud = this.container.querySelector('#game-observer-hud');
    if (hud) {
      hud.remove();
      console.log('[HUD] remove');
      console.log('[HUD] removed from DOM');
    }
    this._eventsAttached = false;
    if (this.container.querySelector('#game-observer-hud')) {
      console.warn('[HUD] existence check after remove: element still in DOM');
    }
  }

  /**
   * Bind control and slider events. Call after render(). Uses callbacks from context.
   */
  attachEvents() {
    if (!this.container) return;

    const root = this.container.querySelector('#game-observer-hud');
    if (!root || this._eventsAttached) return;

    const interactiveSelectors = [
      '#game-observer-state-slider',
      '#observer-back',
      '#observer-play',
      '#observer-forward'
    ];

    interactiveSelectors.forEach((selector) => {
      const el = root.querySelector(selector);
      if (!el) return;

      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      });
    });

    const ctx = this._context || {};

    const backBtn = root.querySelector('#observer-back');
    if (backBtn && typeof ctx.onBack === 'function') {
      backBtn.onclick = (e) => {
        if (e.target.closest('button')?.disabled) return;
        const observer = ctx.observer;
        if (observer && !observer._history_complete && observer._viewingIndex > 0) {
          observer.rebuildHistoryFromArchive();
          return;
        }
        ctx.onBack();
      };
    }

    const playBtn = root.querySelector('#observer-play');
    if (playBtn && typeof ctx.onPlay === 'function') {
      playBtn.onclick = () => ctx.onPlay();
    }

    const fwdBtn = root.querySelector('#observer-forward');
    if (fwdBtn && typeof ctx.onForward === 'function') {
      fwdBtn.onclick = (e) => {
        if (e.target.closest('button')?.disabled) return;
        if (fwdBtn) fwdBtn.classList.remove('flashit');
        ctx.onForward();
      };
    }

    const slider = root.querySelector('#game-observer-state-slider');
    const timelineTooltip = root.querySelector('#observer-timeline-tooltip');
    if (slider && typeof ctx.onSliderInput === 'function') {
      slider.addEventListener('input', () => {
        const idx = parseInt(slider.value, 10);
        if (Number.isNaN(idx)) return;

        const total = Math.max(0, ctx.getState?.().totalMoves ?? 0);
        const knownTotal = total || (ctx.observer?.game_moves?.length ?? 0);
        const max = Math.max(0, knownTotal - 1);
        const progress = max > 0 ? `${(idx / max) * 100}%` : '0%';
        slider.style.setProperty('--progress', progress);

        if (timelineTooltip && knownTotal > 0) {
          timelineTooltip.textContent = `Move ${idx + 1}`;
          timelineTooltip.classList.add('visible');
          timelineTooltip.setAttribute('aria-hidden', 'false');
        }
      });

      slider.addEventListener('change', () => {
        const idx = parseInt(slider.value, 10);
        if (Number.isNaN(idx)) return;

        if (timelineTooltip) {
          timelineTooltip.classList.remove('visible');
          timelineTooltip.textContent = '';
          timelineTooltip.setAttribute('aria-hidden', 'true');
        }

        ctx.onSliderInput(idx);
      });
    }

    if (this.app && this.app.browser && typeof this.app.browser.makeDraggable === 'function') {
      this.app.browser.makeDraggable('game-observer-hud');
    }

    this._eventsAttached = true;
  }

  /**
   * Update status line, slider range/value, and button disabled state from context.getState().
   * getState() should return { totalMoves, viewingIndex, isPaused }.
   */
  updateUIState() {
    if (!this.container) return;

    const ctx = this._context || {};
    const getState = typeof ctx.getState === 'function' ? ctx.getState() : null;
    if (!getState) return;

    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;

    const total = Math.max(0, getState.totalMoves ?? 0);
    const knownTotal = total || (this._context?.observer?.game_moves?.length ?? 0);
    const viewingIndex = Math.max(
      0,
      Math.min(getState.viewingIndex ?? 0, Math.max(0, knownTotal - 1))
    );
    const isPaused = !!getState.isPaused;

    const statusEl = root.querySelector('#observer-status-line');
    if (statusEl) {
      if (isPaused) {
        statusEl.textContent = 'Press Play to Observe';
      } else {
        statusEl.textContent = getState.statusMessage || 'Observer mode';
      }
    }

    const timelineEndEl = root.querySelector('.timeline-end');
    if (timelineEndEl) {
      timelineEndEl.textContent = String(knownTotal);
    }

    const sliderEl = root.querySelector('#game-observer-state-slider');
    if (sliderEl) {
      const max = Math.max(0, knownTotal - 1);
      sliderEl.max = String(max);
      sliderEl.value = String(viewingIndex);
      const progress = max > 0 ? `${(viewingIndex / max) * 100}%` : '0%';
      sliderEl.style.setProperty('--progress', progress);
    }

    const backBtn = root.querySelector('#observer-back');
    if (backBtn) backBtn.disabled = knownTotal === 0 || viewingIndex <= 0;

    const fwdBtn = root.querySelector('#observer-forward');
    if (fwdBtn) fwdBtn.disabled = knownTotal === 0 || viewingIndex >= knownTotal - 1;

    const playBtn = root.querySelector('#observer-play');
    if (playBtn) {
      playBtn.setAttribute('title', isPaused ? 'Resume' : 'Pause');
      playBtn.classList.toggle('play-state', isPaused);
      playBtn.classList.toggle('pause-state', !isPaused);
    }
  }

  /**
   * Update the status message used when playback is active (shadow_status).
   * Caller may pass HTML; it is stripped for the single status line.
   */
  updateStatus(message) {
    const observer = this._context?.observer;
    if (observer && typeof message === 'string') {
      observer.shadow_status = message.replace(/<[^>]*>/g, '').trim() || observer.shadow_status;
    }
    this.updateUIState();
  }

  /**
   * Show and enable the forward button (e.g. add flashit, refresh disabled state).
   */
  showNextMoveButton() {
    if (!this.container) return;
    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;
    const fwdBtn = root.querySelector('#observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.add('flashit');
      this.updateUIState();
    }
  }

  /**
   * Hide emphasis and disable the forward button.
   */
  hideNextMoveButton() {
    if (!this.container) return;
    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;
    const fwdBtn = root.querySelector('#observer-forward');
    if (fwdBtn) {
      fwdBtn.classList.remove('flashit');
      fwdBtn.disabled = true;
    }
  }
}

module.exports = GameObserverHUD;
