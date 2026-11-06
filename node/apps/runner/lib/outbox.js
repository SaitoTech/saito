// Watch mode has no game module. Retries belong to their signed transactions,
// which retain the recipients and request type across game/process handoffs.
module.exports = async function retransmit({ app, mod, propagate, offline, Transaction }) {
  for (const [signature, json] of Object.entries(app.options.runnerOutbox || {})) {
    const tx = new Transaction(undefined, json), msg = tx.returnMessage();
    // Keep cancellations and forfeits available across game handoffs for disconnected
    // opponents. Ordinary moves can be discarded once a game is over.
    if (msg.request === 'gameover' && ['cancellation', 'forfeit'].includes(msg.reason)) {
      if (Date.now() - tx.timestamp > 86400000) { delete app.options.runnerOutbox[signature]; continue; }
      await propagate(tx);
      if (!offline) {
        app.connection.emit('relay-send-message', { recipient: tx.to.map(slip => slip.publicKey), request: 'game relay update', data: tx.toJson() });
        app.connection.emit('relay-send-message', { recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson() });
      }
      continue;
    }
    const finished = app.options.games.find(g => g.over &&
      (g.id === msg.game_id || (msg.module === 'Arcade' && g.id === tx.signature)));
    if (finished) { delete app.options.runnerOutbox[signature]; continue; }
    if (msg.module === 'Arcade' && mod?.game?.players_set && mod.game.step.game > 2) {
      delete app.options.runnerOutbox[signature];
      continue;
    }
    if (mod?.game && msg.module === mod.name && mod.game.id === msg.game_id &&
        (mod.game.step?.players?.[mod.publicKey] >= msg.step?.game || mod.game.over)) {
      delete app.options.runnerOutbox[signature];
      continue;
    }
    await propagate(tx);
    if (!offline) app.connection.emit('relay-send-message', {
      recipient: msg.module === 'Arcade' ? 'PEERS' : tx.to.map(slip => slip.publicKey),
      request: msg.module === 'Arcade' ? 'arcade spv update' : msg.request === 'game' ? 'game relay gamemove' : 'game relay update', data: tx.toJson()
    });
  }
  app.storage.saveOptions();
};
