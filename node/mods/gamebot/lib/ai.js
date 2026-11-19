class AI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  async requestResponse(context) {
    this.context = context;
    if (typeof this.mod.game_screen?.context?.update === 'function') {
      this.mod.game_screen.context.update(context);
    }
    return context;
  }

  async receiveResponse(game_id, response) {
    const timestamp = response?.timestamp;
    const current = this.mod.manager?.games?.[game_id]?.last_queue_stable ?? 0;
    if (timestamp !== current) {
      return null;
    }
    return this.mod.manager.handleResponse(game_id, response);
  }
}

module.exports = AI;
