class RobotsLeaderboard {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  get id() {
    return this.app.crypto.hash(this.mod.returnName());
  }

  async configure() {
    const league = this.app.modules.returnModule('League');
    if (!league) return;
    // Existing installations already have an EXP default league. League's insert
    // ignores existing rows, and its public update API cannot change the algorithm.
    // Migrate only this module's default league; preserve players and their records.
    if (!this.app.BROWSER) {
      await this.app.storage.runDatabase(
        `UPDATE leagues SET ranking_algorithm = 'HSC', default_score = 0
         WHERE id = $id AND game = $game AND admin = '' AND ranking_algorithm = 'EXP'`,
        { $id: this.id, $game: this.mod.name },
        'league'
      );
    }
    const record = league.returnLeague(this.id);
    if (
      record &&
      record.game === this.mod.name &&
      !record.admin &&
      record.ranking_algorithm === 'EXP'
    ) {
      await league.updateLeague({ id: this.id, ranking_algorithm: 'HSC', default_score: 0 });
    }
  }

  recordClear(run) {
    const best = this.mod.loadGamePreference('Robots_leaderboard_best') || 0;
    if (run.leaderboardPoints > best) {
      this.mod.saveGamePreference('Robots_leaderboard_best', run.leaderboardPoints);
    }
    // LevelSaves publishes the standard roundover result with its checkpoint.
  }

  rank() {
    const league = this.app.modules.returnModule('League')?.returnLeague(this.id);
    const position = league?.players?.findIndex(
      (player) => player.publicKey === this.mod.publicKey
    );
    return position >= 0 ? position + 1 : null;
  }

  show() {
    this.app.connection.emit('league-overlay-render-request', this.id);
  }
}

module.exports = RobotsLeaderboard;
