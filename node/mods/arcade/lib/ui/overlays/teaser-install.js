/**
 * Teaser install overlay — replaces native confirm() for uninstalled games.
 * Opens the game's wiki/application link in a new tab when the user continues.
 */
const TeaserInstallTemplate = require('./teaser-install.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class TeaserInstallOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.link = '';

    app.connection.on('arcade-teaser-install-render-request', (obj = {}) => {
      this.open(obj);
    });
  }

  open(obj = {}) {
    let game = obj.game || null;
    let game_mod = obj.game_mod || game?.game_mod || null;

    let title =
      obj.title ||
      game?.title ||
      (game_mod?.returnName ? game_mod.returnName() : '') ||
      game_mod?.name ||
      'Game';

    let image = obj.image || game_mod?.img || game?.image || '';
    if (!image && game_mod) {
      try {
        image = game_mod.respondTo('arcade-games')?.image || '';
      } catch (_) {}
    }

    let description = obj.description || game_mod?.description || '';
    this.link = obj.link || game?.link || game_mod?.link || '';

    this.overlay.show(TeaserInstallTemplate({ title, image, description }));
    if (image) {
      this.overlay.setBackground(image);
    }
    this.attachEvents();
  }

  attachEvents() {
    let btn = document.querySelector('.arcade-teaser-install [data-action="install"]');
    if (!btn) {
      return;
    }

    btn.onclick = (e) => {
      e.preventDefault();
      if (!this.link) {
        siteMessage('No install link is available for this game.', 2500);
        return;
      }
      this.overlay.remove();
      window.open(this.link, '_blank', 'noopener,noreferrer');
    };
  }
}

module.exports = TeaserInstallOverlay;
