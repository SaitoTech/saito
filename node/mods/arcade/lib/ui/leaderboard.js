/**
 * Mounts the existing League leaderboard into the Arcade sidebar.
 *
 * League owns ranking data and LeagueRankings presentation; it mounts via
 * canRenderInto('.redsquare-leaderboard'). We provide that mount point inside
 * Arcade without modifying League or RedSquare.
 */
class ArcadeLeaderboard {
  constructor(app, mod, container = '.arcade-leaderboard') {
    this.app = app;
    this.mod = mod;
    this.container = container;
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
  }
}

module.exports = ArcadeLeaderboard;
