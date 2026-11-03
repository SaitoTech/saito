// Use the engine's signed gameover protocol for cancellation or forfeit.
// Normally only the first player publishes a no-winner gameover. An unattended
// runner must also publish when the chosen sender is an absent opponent.
module.exports = async function endGame(runtime, winner = [], reason = 'cancellation') {
  const { app, mod } = runtime;
  if (mod.game.over) return;
  const tx = await mod.sendGameOverTransaction(winner, reason);
  if (tx) {
    await app.network.propagateTransaction(tx);
    app.connection.emit('relay-send-message', {
      recipient: mod.game.accepted, request: 'game relay update', data: tx.toJson()
    });
    app.connection.emit('relay-send-message', {
      recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson()
    });
    mod.game.gameover_sent = 1;
  }
  // A restart must not restore a suspended decision after cancellation.
  for (const key of ['runnerDraft', 'runnerDecision', 'runnerTwilight', 'runnerTwilightWait', 'runnerPaths', 'runnerPathsWait']) delete mod.game[key];
  await mod.triggerGameOver(winner, reason);
  mod.saveGame(mod.game.id);
};
