const { setTimeout: delay } = require('node:timers/promises');
const { compatible } = require('./daemon-policy');
const { play, providerFor } = require('./loop');

// One instance in one native process. Only public identity, roster and progress
// leave this boundary; observations and model prompts stay with their wallet.
class MultiSeat {
  constructor(config, { signal, report, permit, boot, offline = false }) {
    Object.assign(this, { config, signal, report, permit, offline });
    this.bootRuntime = boot || ((c, options) => require('./runtime').createRuntime(c, options));
  }
  async boot() {
    this.runtime = await this.bootRuntime(this.config, { discover: true, coordinated: true });
    return this.status();
  }
  status() {
    const { app, mod } = this.runtime;
    return { publicKey: mod.publicKey, reservation: app.options.runnerMulti?.id,
      games: app.options.games.map(g => ({ id: g.id, module: g.module, over: !!g.over })),
      gameId: mod.game?.id, over: !!mod.game?.over };
  }
  save() { this.runtime.app.storage.saveOptions(); }
  async wait(predicate, label) {
    const deadline = Date.now() + this.config.multi.joinTimeoutMs;
    while (true) {
      this.signal.throwIfAborted();
      if (this.runtime.app.runnerFailure || this.failure) throw this.runtime.app.runnerFailure || this.failure;
      const result = await predicate();
      if (result) return result;
      if (Date.now() >= deadline) throw Error(`${label} timed out; use multi-resume with the same config`);
      if (!this.offline) await this.runtime.discovery.refresh(this.config.daemon.refreshMs);
      await delay(Math.min(this.config.pollMs, 250), undefined, { signal: this.signal });
    }
  }
  async ready() {
    if (!this.offline) await this.wait(() => this.runtime.discovery.lastRefresh, 'Arcade discovery');
  }
  assertAvailable(id) {
    const { app } = this.runtime;
    if (app.options.games.some(g => !g.over && (g.id !== id || g.module !== this.config.game))) {
      throw Error('Seat has a different unfinished game');
    }
    const old = app.options.runnerMulti?.id;
    if (old && old !== id && !app.options.games.some(g => g.id === old && g.over)) {
      throw Error('Seat is already reserved for another invitation');
    }
  }
  async prepareHost() {
    const { app, arcade } = this.runtime;
    const saved = app.options.runnerMulti;
    if (saved?.role === 'host' && saved.invite && !app.options.games.some(g => g.id === saved.id && g.over)) {
      return { id: saved.id };
    }
    this.assertAvailable(null);
    const tx = await arcade.createOpenTransaction({ ts: Date.now(), name: this.config.game,
      options: { game_length: 10, turn_limit: 0, conquest_setup: 'quick', ...this.config.options },
      players_needed: this.config.players, invitation_type: 'open' });
    app.options.runnerMulti = { id: tx.signature, role: 'host', invite: tx.toJson() };
    this.save(); // Before publishing, and before the supervisor records the ID.
    return { id: tx.signature };
  }
  async bind({ id, role }) {
    this.assertAvailable(id);
    const { app } = this.runtime;
    if (app.options.runnerMulti?.id !== id) app.options.runnerMulti = { id, role };
    if (app.options.runnerMulti.role !== role) throw Error('Seat role changed; use the original session');
    this.save();
  }
  async publish() {
    const { app, arcade } = this.runtime, saved = app.options.runnerMulti;
    if (saved.role !== 'host' || !saved.invite) throw Error('No prepared host invitation');
    if (app.options.games.some(g => g.id === saved.id)) return;
    const Transaction = require('../../lib/saito/transaction').default;
    const tx = new Transaction(undefined, saved.invite);
    await this.runtime.runExclusive(async () => {
      await arcade.receiveOpenTransaction(tx);
      await app.network.propagateTransaction(tx);
      app.connection.emit('relay-send-message', { recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson() });
    });
  }
  roster() {
    const { app, mod, arcade } = this.runtime, id = app.options.runnerMulti?.id;
    const game = app.options.games.find(g => g.id === id);
    return game?.players || (mod.game?.id === id && mod.game?.players_set ? mod.game.players : arcade.returnGame(id)?.tx.returnMessage().players) || [];
  }
  async validateGroup({ keys }) {
    const { app, arcade } = this.runtime, id = app.options.runnerMulti.id;
    const saved = app.options.games.find(g => g.id === id);
    if (saved) {
      if (keys.some(k => !saved.players.includes(k))) throw Error('The accepted game does not contain all configured bot seats');
      return;
    }
    const record = await this.wait(() => arcade.returnGame(id), 'Invitation discovery');
    const roster = record.tx.returnMessage().players;
    const absent = keys.filter(k => !roster.includes(k));
    if (roster.length + absent.length > this.config.players) throw Error('Invitation has insufficient room for all bot seats');
    for (const key of absent) {
      if (!compatible(record, [this.config.game], key, Date.now(), this.config.players)) throw Error('Invitation is unavailable or incompatible with a bot seat');
    }
  }
  async join() {
    const { app, arcade, mod } = this.runtime, saved = app.options.runnerMulti;
    if (app.options.games.some(g => g.id === saved.id) || this.roster().includes(mod.publicKey)) return;
    if (!saved.joined) {
      await this.wait(() => arcade.returnGame(saved.id), 'Invitation discovery');
      await this.runtime.runExclusive(async () => {
        const record = arcade.returnGame(saved.id);
        if (!compatible(record, [this.config.game], mod.publicKey, Date.now(), this.config.players)) throw Error('Invitation filled, closed or changed before joining');
        const tx = await arcade.createJoinTransaction(record.tx);
        saved.joined = true;
        // Runtime persists this flag and the signed outbox together before sending.
        await app.network.propagateTransaction(tx);
        app.connection.emit('relay-send-message', { recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson() });
      });
    }
    await this.runtime.retransmit();
    await this.wait(() => this.roster().includes(mod.publicKey), 'Join acknowledgement');
    this.report({ event: 'seat-joined', game: saved.id });
  }
  async start() {
    if (this.running) return;
    const { app, mod, adapter } = this.runtime, id = app.options.runnerMulti.id;
    const saved = app.options.games.find(g => g.id === id);
    if (saved?.over) {
      this.report({ event: 'complete', game: id, winner: saved.winner });
      this.running = Promise.resolve(); return;
    }
    if (saved && (mod.game?.id !== id || !mod.initialize_game_run)) {
      await this.runtime.runExclusive(() => require('./resume')(this.runtime, id));
    }
    const base = providerFor(this.config.decisionProvider);
    const provider = { choose: async (decision, signal) => {
      const release = await this.permit(signal);
      try {
        // Another player's move may arrive while this seat waits for Codex capacity.
        if (adapter.current()?.id !== decision.id) return decision.choices[0].id;
        return await base.choose(decision, signal);
      } finally { release(); }
    } };
    this.running = play(this.runtime, this.config, { signal: this.signal, report: this.report, provider, waitForOpponent: true })
      .catch(error => {
        if (error.name !== 'AbortError') { this.failure = error; this.report({ event: 'seat-error', message: error.message }); }
      });
  }
}
module.exports = MultiSeat;
