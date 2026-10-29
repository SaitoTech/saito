const { setTimeout: delay } = require('node:timers/promises');
const CodexProvider = require('./providers/codex');
function providerFor(config) {
  if (config.type === 'codex') return new CodexProvider(config);
  return { choose: async d => d.choices.reduce((best, c) => c.score > best.score ? c : best).id };
}
async function play(runtime, config, { signal, report = console.log, provider = providerFor(config.decisionProvider), waitForOpponent = false } = {}) {
  const { mod, adapter, app } = runtime;
  let lastProgress = Date.now(), lastRevision = '', decisions = 0, resendAt = 0, failure;
  const onError = error => { failure = error; };
  app.connection.on('runner-error', onError);
  try {
    while (!signal?.aborted) {
      if (failure || app.runnerFailure) throw failure || app.runnerFailure;
      if (mod.game?.over) { report({ event: 'complete', game: mod.game.id, winner: mod.game.winner }); return; }
      const revision = JSON.stringify([mod.game?.id, mod.game?.step, mod.game?.queue, mod.game?.runnerDecision]);
      if (revision !== lastRevision) { lastProgress = Date.now(); lastRevision = revision; }
      if (Date.now() > resendAt) { await runtime.retransmit(); resendAt = Date.now() + 20000; }
      const current = adapter.current();
      if (current) {
        if (!current.choices.length) throw Error('No legal candidates for ' + current.observation.phase);
        if (++decisions > config.maxDecisions) throw Error('Decision limit reached');
        report({ event: 'thinking', phase: current.observation.phase, choices: current.choices.length, decision: current.id });
        const choice = await provider.choose(current, signal);
        // Network messages keep processing while the model thinks. Never apply a stale answer.
        if (adapter.current()?.id !== current.id) { report({ event: 'stale', decision: current.id }); continue; }
        await runtime.runExclusive(async () => {
          if (adapter.current()?.id === current.id) await adapter.submit(current.id, choice);
        });
        mod.saveGame(mod.game.id);
        lastProgress = Date.now();
        report({ event: 'played', decision: current.id, choice });
      } else if (Date.now() - lastProgress > config.idleTimeoutMs) {
        if (!waitForOpponent) throw Error('No game progress before idle timeout; use resume when opponents return');
        report({ event: 'waiting-for-opponent', game: mod.game?.id });
        lastProgress = Date.now();
      }
      await delay(config.pollMs, undefined, { signal });
    }
  } finally { app.connection.removeListener('runner-error', onError); }
}
module.exports = { play, providerFor };
