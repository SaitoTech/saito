module.exports = async function resume(runtime, gameId) {
  const { app, mod, adapter } = runtime;
  const saved = app.options.games.filter(g => g.module === mod.name && !g.over && (!gameId || g.id === gameId));
  if (saved.length !== 1) throw Error('resume needs exactly one unfinished game; supply its game id');
  mod.loadGame(saved[0].id);
  if (adapter.restore && (mod.game.runnerTwilight || mod.game.runnerTwilightWait || mod.game.runnerDraft)) {
    await adapter.restore();
    await mod.processFutureMoves();
  } else if (mod.game.runnerDecision || mod.game.runnerDraft) {
    mod.initializeGame(mod.game.id);
    mod.initialize_game_run = 1;
    mod.game.initialize_game_run = 1;
    mod.gaming_active = 0;
    if (mod.game.runnerDraft) await adapter.sendDraft();
    await mod.processFutureMoves();
  } else await mod.initializeGameQueue(mod.game.id);
  await runtime.retransmit();
};
