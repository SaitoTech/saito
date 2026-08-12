/**
 * Arcade game-info overlay — game artwork + leaderboard.
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
      let pack = this.game_mod.respondTo('arcade-games') || {};
      image = pack.banner || pack.image || '';
    } catch (_) {}
    if (!image) {
      image = `/${this.game_mod.returnSlug()}/img/arcade/arcade-banner-background.png`;
    }

    let title = this.game_mod.returnName ? this.game_mod.returnName() : this.game_mod.name;

    this.overlay.show(
      ArcadeGameInfoTemplate({
        title,
        image,
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
    let create_btn = document.querySelector('.arcade-game-info [data-action="create"]');
    if (!create_btn) {
      return;
    }

    create_btn.onclick = (e) => {
      e.preventDefault();
      this.overlay.remove();

      let payload = { game: this.game_mod.name };
      if (this.league?.admin) {
        payload.league = this.league;
      } else {
        payload.skip = 1;
      }
      this.app.connection.emit('arcade-launch-game-wizard', payload);
    };
  }
}

module.exports = ArcadeGameInfo;
