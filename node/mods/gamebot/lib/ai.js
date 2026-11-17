class AI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  // No provider is configured. A later connection should return
  // { game_id, identifier } when it has chosen a listed control.
  async submit_analysis(context) {
    return {
      configured: false,
      game_id: context?.game_id || '',
      identifier: null,
      context
    };
  }
}

module.exports = AI;
