class AI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.slots = {};
  }

  async requestResponse(context) {
    const game_id = this.mod.manager?.view?.game_id || context?.game?.id || '';
    const hash = this.app.crypto.hash(JSON.stringify(context));
    const slot = this.slots[game_id];
    if (slot && slot.hash === hash && slot.response != null) {
      return slot.response;
    }
    if (slot && slot.hash === hash && slot.pending) {
      return;
    }
    this.slots[game_id] = { hash, response: null, pending: true };
    this.context = context;
    if (typeof this.mod.game_screen?.context?.update === 'function') {
      this.mod.game_screen.context.update(context);
    }
    return context;
  }

  async receiveResponse(game_id, response) {
    const slot = this.slots[game_id];
    if (response == null) {
      if (slot && slot.pending) {
        slot.pending = false;
        slot.response = null;
      }
      return null;
    }
    const timestamp = response?.timestamp;
    const current = this.mod.manager?.games?.[game_id]?.last_queue_stable ?? 0;
    if (timestamp !== current) {
      return null;
    }
    if (slot && slot.response != null) {
      return slot.response;
    }
    const record = this.mod.manager?.returnGame?.(game_id);
    if (slot && record && record.answered === slot.hash) {
      return null;
    }
    if (record && slot?.hash) {
      record.answered = slot.hash;
    }
    let result = null;
    let failure = null;
    try {
      result = await this.mod.manager.handleResponse(game_id, response);
    } catch (err) {
      failure = err;
    }
    if (failure || result == null) {
      if (slot && this.slots[game_id] === slot) {
        slot.pending = false;
        slot.response = null;
      }
      if (record && slot?.hash && record.answered === slot.hash) {
        record.answered = '';
      }
      if (failure) {
        throw failure;
      }
      return null;
    }
    if (slot && this.slots[game_id] === slot) {
      slot.response = response;
      slot.pending = false;
    }
    return result;
  }
}

module.exports = AI;
