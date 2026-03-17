const GameObserverLoaderTemplate = require('./game-observer-loader.template');

/**
 * Loader/sync overlay component for the game observer.
 * - Renders into this.container (set in constructor). If container not provided, uses document.body.
 * - Replaces existing #observer-sync-overlay if present. No engine state mutation, no sync logic.
 *
 * @param {Object} app - Saito application.
 * @param {Object} game_mod - Game module (stored for optional use by consumers; this class does not mutate it).
 * @param {Element|string} [container=""] - DOM element to own; if falsy, document.body.
 */
class GameObserverLoader {
  constructor(app, game_mod, container = '', observer) {
    this.app = app || null;
    this.game_mod = game_mod || null;
    this.observer = observer || null;
    this.container = container || (typeof document !== 'undefined' ? document.body : null);
  }

  render() {
    if (!this.container || typeof document === 'undefined') {
      return;
    }

    const html = GameObserverLoaderTemplate();
    if (!html || !html.trim()) {
      return;
    }

    const hud = this.container.querySelector('#game-observer-hud');
    const existing = this.container.querySelector('#observer-sync-overlay');
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const node = wrap.firstElementChild;
    if (!node) return;

    if (existing) {
      existing.replaceWith(node);
    } else {
      this.container.appendChild(node);
    }

    if (existing && hud) {
      const hudZ = parseInt(window.getComputedStyle(hud).zIndex) || 0;
      existing.style.zIndex = hudZ + 1;
    }

    console.log(
      '[OBS_TRACE] Loader.render() called; overlay in DOM:',
      !!this.container.querySelector('#observer-sync-overlay')
    );
  }

  /**
   * Hide the overlay with display:none in this.container.
   */
  hide() {
    if (!this.container || typeof document === 'undefined') {
      return;
    }

    const overlay = this.container.querySelector('#observer-sync-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      console.log('[OBS_TRACE] Loader.hide() called');
    }
  }

  /**
   * Remove #observer-sync-overlay from this.container.
   */
  remove() {
    if (!this.container || typeof document === 'undefined') {
      return;
    }

    const overlay = this.container.querySelector('#observer-sync-overlay');
    if (overlay) {
      overlay.remove();
      console.log('[OBS_TRACE] Loader.remove() called; overlay removed from DOM');
    }
    if (this.container.querySelector('#observer-sync-overlay')) {
      console.warn('[Loader] existence check after remove: element still in DOM');
    }
  }

  /**
   * Update the sync status text inside the overlay. No-op if overlay not in this.container.
   *
   * @param {string} message - Status message to display.
   */
  updateStatus(message) {
    if (!this.container || message == null) return;
    const el = this.container.querySelector('#observer-sync-status');
    if (el) el.innerText = message;
  }
}

module.exports = GameObserverLoader;
