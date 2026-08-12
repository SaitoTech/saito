/**
 * Arcade library Game.
 *
 * One Game represents one title Arcade can show and select.
 * Selection is Game.onClick(): optional game_data.onClick override, else
 * normal Arcade behavior.
 */

class Game {
  constructor(app, mod, game_data = {}) {
    this.app = app;
    this.mod = mod;
    this.game_data = game_data;
    this.game_mod = game_data.game_mod || null;

    this.name = game_data.name || this.game_mod?.name || '';
    this.slug = game_data.slug || this.game_mod?.returnSlug?.() || '';
    this.title =
      game_data.title ||
      (this.game_mod?.returnName ? this.game_mod.returnName() : '') ||
      this.name;
    this.image = game_data.image || '';
    this.link = game_data.link || this.game_mod?.link || '';
    this.league_id = game_data.league_id || '';
  }

  /**
   * Selection entry point.
   * If the creator supplied game_data.onClick, run that; otherwise run the
   * normal Arcade flow (install / launch / game-info / wizard).
   */
  async onClick() {
    if (typeof this.game_data.onClick === 'function') {
      return await this.game_data.onClick(this);
    }

    if (this.game_mod?.teaser === true || this.game_mod?.is_teaser === true) {
      let ok = confirm(
        'Do you want to install this game? This will take you to the app download site:'
      );
      if (ok && this.link) {
        navigateWindow(this.link, 300);
      }
      return;
    }

    if (this.league_id) {
      this.app.connection.emit('arcade-game-info-render-request', {
        game: this.name,
        leagueId: this.league_id
      });
      return;
    }

    this.app.connection.emit('arcade-launch-game-wizard', { game: this.name });
  }
}

module.exports = Game;
