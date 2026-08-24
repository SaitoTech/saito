/**
 * Mounts the existing League leaderboard into the Arcade sidebar.
 *
 * League owns ranking data and LeagueRankings presentation; it mounts via
 * canRenderInto('.redsquare-leaderboard'). We provide that mount point inside
 * Arcade without modifying League or RedSquare.
 *
 * Row clicks open Arcade game-info (artwork + rankings), not the League overlay.
 */
class ArcadeLeaderboard {
  constructor(app, mod, container = '.arcade-leaderboard') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    app.connection.on('league-rankings-render-request', () => {
      if (!this.mod?.browser_active) {
        return;
      }
      queueMicrotask(() => this.bindClicks());
    });
  }

  async render() {
    const el = document.querySelector(this.container);
    if (!el) {
      return;
    }

    // League's renderInto selector — do not invent a parallel ranking UI.
    if (!el.classList.contains('redsquare-leaderboard')) {
      el.classList.add('redsquare-leaderboard');
    }

    await this.app.modules.renderInto('.redsquare-leaderboard');
    this.bindClicks();
  }

  bindClicks() {
    const el = document.querySelector(this.container);
    if (!el) {
      return;
    }

    el.querySelectorAll('.league-leaderboard-ranking').forEach((row) => {
      row.onclick = (e) => {
        e.preventDefault();
        this.app.connection.emit('arcade-game-info-render-request', {
          leagueId: row.getAttribute('data-id'),
          game: row.getAttribute('data-game')
        });
      };
    });
  }
}

module.exports = ArcadeLeaderboard;
