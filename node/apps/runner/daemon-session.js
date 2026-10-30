const { setTimeout: delay } = require('node:timers/promises');
const { DaemonPolicy, compatible } = require('./daemon-policy');

module.exports = async function run(config, task, { signal, report,
  boot = (...args) => require('./runtime').createRuntime(...args),
  playGame = require('./loop').play,
  resumeGame = require('./resume')
}) {
  const runtime = await boot({ ...config, game: task.game || config.game },
    { monitor: task.mode === 'watch', chat: config.daemon.mode === 'ask', discover: true });
  const { app, arcade } = runtime;
  const save = () => app.storage.saveOptions();
  const state = app.options.runnerDaemon ||= { invites: {} };
  report({ event: 'wallet', publicKey: app.options.wallet.publicKey, mode: task.mode });
  if (task.mode === 'watch') {
    const unfinished = app.options.games.filter(g => !g.over);
    if (unfinished.length > 1) throw Error('Daemon requires at most one unfinished game in its dataDir');
    if (unfinished.length) {
      const game = unfinished[0];
      if (!config.daemon.games.includes(game.module)) throw Error(`Unfinished ${game.module} game is outside daemon.games; resume it first`);
      return { mode: 'play', game: game.module, id: game.id, resume: true };
    }
    if (state.active) {
      if (!config.daemon.games.includes(state.active.game)) throw Error(`Pending ${state.active.game} invitation is outside daemon.games; resolve it before watching`);
      const completed = app.options.games.find(g => g.id === state.active.id && g.over);
      if (!completed) return { mode: 'play', ...state.active };
      if (state.invites[state.active.id]) state.invites[state.active.id].status = 'complete';
      delete state.active; save();
    }
  }
  const discovery = runtime.discovery;
  const began = Date.now();
  while (!discovery.lastRefresh) {
    if (app.runnerFailure) throw app.runnerFailure;
    if (Date.now() - began > 30000) throw Error('Arcade discovery timed out; daemon state saved');
    await delay(250, undefined, { signal });
  }
  if (task.mode === 'watch') {
    const policy = new DaemonPolicy(runtime, config, report);
    report({ event: 'watching', games: config.daemon.games, mode: config.daemon.mode });
    let chatRefresh = 0;
    while (!signal.aborted) {
      if (app.runnerFailure) throw app.runnerFailure;
      await discovery.refresh(config.daemon.refreshMs);
      if (runtime.chat && Date.now() > chatRefresh) {
        runtime.chat.refreshHistory(); chatRefresh = Date.now() + config.daemon.refreshMs;
      }
      if (Date.now() - discovery.lastRefresh < config.daemon.refreshMs * 2) {
        const selected = await runtime.runExclusive(() => policy.tick());
        if (selected) return { mode: 'play', ...selected };
      }
      await delay(config.pollMs, undefined, { signal });
    }
  } else {
    if (task.resume || app.options.games.some(g => g.id === task.id && !g.over)) {
      if (runtime.mod.game?.id !== task.id || !runtime.mod.initialize_game_run) await resumeGame(runtime, task.id);
    } else if (!state.active?.joined) {
      const joined = await runtime.runExclusive(async () => {
        const record = arcade.returnGame(task.id);
        if (!compatible(record, [task.game], app.options.wallet.publicKey, Date.now(), config.players ?? 2)) return false;
        // Persist the signed join through runtime's outbox before delivery.
        const tx = await arcade.createJoinTransaction(record.tx);
        state.active = { id: task.id, game: task.game, joined: true };
        await app.network.propagateTransaction(tx);
        app.connection.emit('relay-send-message', { recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson() });
        save();
        return true;
      });
      if (!joined) {
        report({ event: 'invite-unavailable', id: task.id });
        if (state.invites[task.id]) state.invites[task.id].status = 'unavailable';
        delete state.active; save(); return { mode: 'watch' };
      }
      report({ event: 'joined', id: task.id, game: task.game });
    } else {
      // A join was already signed before a restart. Never sign a second join or
      // move on to another opponent while this acceptance may still arrive.
      await runtime.retransmit();
      report({ event: 'awaiting-acceptance', id: task.id, game: task.game });
    }
    await playGame(runtime, { ...config, game: task.game }, { signal, report, waitForOpponent: true });
    if (!runtime.mod.game?.over) return { mode: 'watch' };
    if (state.invites[task.id]) state.invites[task.id].status = 'complete';
    delete state.active;
    save();
    return { mode: 'watch' };
  }
}
