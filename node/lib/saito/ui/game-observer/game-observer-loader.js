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
  constructor(app, game_mod, container = '') {
    this.app = app || null;
    this.game_mod = game_mod || null;
    this.container = container || (typeof document !== 'undefined' ? document.body : null);
  }

  /**
   * Insert or replace #observer-sync-overlay in this.container. Idempotent.
   */
  render() {

alert("Game Loader 1");
    if (!this.container || typeof document === 'undefined') { return; }
alert("Game Loader 2");

    const html = GameObserverLoaderTemplate();
    if (!html || !html.trim()) { return; }
alert("Game Loader 3");

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

    console.log('[Loader] render');
    if (this.container.querySelector('#observer-sync-overlay')) {
      console.log('[Loader] visible');
    }
  }

  /**
   * Hide the overlay with display:none in this.container.
   */
  hide() {
alert("hiding loader...");
    if (!this.container || typeof document === 'undefined') { return; }

    const overlay = this.container.querySelector('#observer-sync-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      console.log('[Loader] hide');
    }
  }

  /**
   * Remove #observer-sync-overlay from this.container.
   */
  remove() {
alert("hiding loader...");
    if (!this.container || typeof document === 'undefined') { return; }

    const overlay = this.container.querySelector('#observer-sync-overlay');
    if (overlay) {
      overlay.remove();
      console.log('[Loader] remove');
      console.log('[Loader] removed from DOM');
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
  updateSyncStatus(message) {
    if (!this.container || message == null) return;
    const el = this.container.querySelector('#observer-sync-status');
    if (el) el.innerText = message;
  }
}

module.exports = GameObserverLoader;
