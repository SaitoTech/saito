const GameObserverHUDTemplate = require('./game-observer-hud.template');

/**
 * HUD component for the game observer: controls, slider, status line only.
 * - Renders into this.container (set in constructor). If container not provided, uses document.body.
 * - Replaces existing #game-observer-hud if present. No sync, stability, or replay logic.
 *
 * @param {Object} app - Saito application (optional; used for makeDraggable).
 * @param {Object} observer - GameObserver instance.
 * @param {Element|string} [container=""] - DOM element to own; if falsy, document.body.
 */
class GameObserverHUD {
  constructor(app, observer, container = '') {
    this.app = app || null;
    this.observer = observer || null;
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
    this.attachEvents();
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
   * Bind control and slider events. Call after render().
   */
  attachEvents() {
    if (!this.container) return;

    const root = this.container.querySelector('#game-observer-hud');
    if (!root || this._eventsAttached) return;

    const observer = this.observer;

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

    const backBtn = root.querySelector('#observer-back');
    if (backBtn && observer) {
      backBtn.onclick = (e) => {
        if (e.target.closest('button')?.disabled) return;
        observer.last();
      };
    }

    const playBtn = root.querySelector('#observer-play');
    if (playBtn && observer) {
      playBtn.onclick = () => observer.startPlayback();
    }

    const fwdBtn = root.querySelector('#observer-forward');
    if (fwdBtn && observer) {
      fwdBtn.onclick = (e) => {
        if (e.target.closest('button')?.disabled) return;
        if (fwdBtn) fwdBtn.classList.remove('flashit');
        observer.next();
      };
    }

    const slider = root.querySelector('#game-observer-state-slider');

    if (slider && observer) {

      slider.addEventListener('mousedown', () => {
        observer.playback_status = "paused";
      });

      slider.addEventListener('touchstart', () => {
        observer.playback_status = "paused";
      });

      slider.addEventListener('change', () => {

        const idx = parseInt(slider.value, 10);
        if (Number.isNaN(idx)) return;

        observer.replayToIndex(idx);

      });

    }

    if (this.app && this.app.browser && typeof this.app.browser.makeDraggable === 'function') {
      this.app.browser.makeDraggable('game-observer-hud');
    }

    this._eventsAttached = true;
  }

  setRange(min, max) {
    if (!this.container) return;
    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;
    const sliderEl = root.querySelector('#game-observer-state-slider');
    if (sliderEl) sliderEl.max = String(Math.max(0, max));
    const timelineEndEl = root.querySelector('.timeline-end');
    if (timelineEndEl) timelineEndEl.textContent = String(max);
  }

  setPosition(pos) {
    if (!this.container) return;
    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;
    const sliderEl = root.querySelector('#game-observer-state-slider');
    if (sliderEl) {
      sliderEl.value = String(pos);
      const max = parseInt(sliderEl.max, 10) || 0;
      const progress = max > 0 ? `${(pos / max) * 100}%` : '0%';
      sliderEl.style.setProperty('--progress', progress);
    }
  }

  /**
   * Update status line, slider range/value, and button disabled state from observer.
   */
  updateUIState() {
    if (!this.container) return;

    const observer = this.observer;
    if (!observer) return;

    const total = observer.all_moves?.length ?? 0;
    const knownTotal = total || (observer.game_moves?.length ?? 0);
    const viewingIndex = Math.max(
      0,
      Math.min(observer._viewingIndex ?? 0, Math.max(0, knownTotal - 1))
    );
    const isPaused = observer._paused ?? true;

    const root = this.container.querySelector('#game-observer-hud');
    if (!root) return;

    const statusEl = root.querySelector('#observer-status-line');
    if (statusEl) {
      if (isPaused) {
        statusEl.textContent = 'Press Play to Observe';
      } else {
        statusEl.textContent = observer.shadow_status || 'Observer mode';
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
    const observer = this.observer;
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
