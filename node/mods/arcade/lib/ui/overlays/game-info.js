/**
 * Arcade game-info overlay — game identity, description, optional leaderboard,
 * and primary create/play action.
 *
 * Replaces routing game-card clicks into the League overlay (Home/Activity tabs,
 * fixed-height empty panels, oversized typography in saito-league.css).
 * Ranking data still comes from League; Arcade owns presentation.
 */
const ArcadeGameInfoTemplate = require('./game-info.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ArcadeGameInfo {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.game_mod = null;
    this.league = null;
    this.leaderboard = null;

    app.connection.on('arcade-game-info-render-request', (obj = {}) => {
      this.open(obj);
    });
  }

  open(obj = {}) {
    let game_name = obj.game || obj.moduleName || null;
    let league_id = obj.leagueId || obj.league_id || null;

    this.game_mod = game_name ? this.app.modules.returnModuleByName(game_name) : null;
    this.league = null;

    let league_mod = this.app.modules.returnModule('League');
    if (league_mod) {
      if (league_id) {
        this.league = league_mod.returnLeague(league_id);
      } else if (game_name) {
        let leagues = league_mod.returnLeaguesByGame(game_name) || [];
        if (leagues.length > 0) {
          this.league = leagues[0];
        }
      }
    }

    if (!this.game_mod && this.league) {
      this.game_mod = this.app.modules.returnModuleByName(this.league.game);
    }

    if (!this.game_mod) {
      console.warn('ArcadeGameInfo: game module not found', obj);
      return;
    }

    this.render();
  }

  async render() {
    let image = '';
    try {
      image = this.game_mod.respondTo('arcade-games')?.image || this.game_mod.img || '';
    } catch (_) {
      image = this.game_mod.img || '';
    }

    let description = this.league?.description || this.game_mod.description || '';
    let title = this.game_mod.returnName ? this.game_mod.returnName() : this.game_mod.name;
    let subtitle = '';
    if (this.game_mod.categories) {
      subtitle = this.game_mod.categories.replace('Games ', '').split(' ').reverse().join(' ');
    }

    let cta = 'Create Game';
    if (
      this.game_mod.maxPlayers === 1 &&
      !this.game_mod.returnSingularGameOption?.() &&
      !this.game_mod.returnAdvancedOptions?.()
    ) {
      cta = 'Play';
    }

    this.overlay.show(
      ArcadeGameInfoTemplate({
        title,
        subtitle,
        description,
        image,
        cta,
        publisher: this.game_mod.publisher_message || '',
        hasLeaderboard: !!this.league
      })
    );

    if (image) {
      this.overlay.setBackground(image);
    }

    if (this.league) {
      await this.mountLeaderboard();
    }

    this.attachEvents();
  }

  async mountLeaderboard() {
    let mount = document.querySelector('.arcade-game-info .leaderboard');
    if (!mount || !this.league) {
      return;
    }

    let league_mod = this.app.modules.returnModule('League');
    if (!league_mod) {
      mount.innerHTML = '';
      return;
    }

    // Reuse League's Leaderboard component (data + ranking) — do not reimplement.
    let Leaderboard = require('../../../../league/lib/leaderboard');
    this.leaderboard = new Leaderboard(
      this.app,
      league_mod,
      '.arcade-game-info .leaderboard',
      this.league
    );
    await this.leaderboard.render();
  }

  attachEvents() {
    let root = document.querySelector('.arcade-game-info');
    if (!root) {
      return;
    }

    let create_btn = root.querySelector('[data-action="create"]');
    if (create_btn) {
      create_btn.onclick = (e) => {
        e.preventDefault();
        this.overlay.remove();

        let payload = { game: this.game_mod.name };
        if (this.league?.admin) {
          payload.league = this.league;
        } else {
          // Open leagues / default games: skip redundant wizard when possible
          payload.skip = 1;
        }
        this.app.connection.emit('arcade-launch-game-wizard', payload);
      };
    }
  }
}

module.exports = ArcadeGameInfo;
