const { setTimeout: delay } = require('node:timers/promises');
const EngineRecovery = require('./engine-recovery');
const { Conversation } = require('./conversation');
const { Inactivity } = require('./inactivity');
const CodexProvider = require('./providers/codex');
function providerFor(config) {
  if (config.type === 'codex') return new CodexProvider(config);
  return { choose: async d => d.choices.reduce((best, c) => c.score > best.score ? c : best).id,
    reply: async () => 'Thanks for the message! I am using the simple test policy, so my chat is limited. Have fun!' };
}
async function play(runtime, config, { signal, report = console.log, provider = providerFor(config.decisionProvider), waitForOpponent = false } = {}) {
  const { mod, adapter, app } = runtime;
  const recovery = new EngineRecovery(runtime, config, { signal, report });
  const inactivity = new Inactivity(runtime, report);
  const conversation = new Conversation(runtime, provider, { signal, report });
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
      const { managed, current } = await runtime.runExclusive(async () => {
        const current = adapter.current();
        const managed = await inactivity.tick(
          JSON.stringify([mod.game?.id, mod.game?.step, mod.game?.queue, mod.game?.runnerDecision]), !!current);
        return { managed, current };
      });
      if (mod.game?.over) continue;
      await conversation.tick();
      if (current) {
        if (!current.choices.length) throw Error('No legal candidates for ' + current.observation.phase);
        if (decisions >= config.maxDecisions) throw Error('Decision limit reached');
        report({ event: 'thinking', phase: current.observation.phase, choices: current.choices.length, decision: current.id });
        let choice;
        try { choice = await provider.choose(current, signal); }
        catch (error) {
          if (signal?.aborted || error.name === 'AbortError') throw error;
          await recovery.failed(error, current.id);
          continue;
        }
        recovery.reset();
        decisions++;
        // Network messages keep processing while the model thinks. Never apply a stale answer.
        if (adapter.current()?.id !== current.id) { report({ event: 'stale', decision: current.id }); continue; }
        await runtime.runExclusive(async () => {
          if (adapter.current()?.id === current.id) await adapter.submit(current.id, choice);
        });
        mod.saveGame(mod.game.id);
        lastProgress = Date.now();
        report({ event: 'played', decision: current.id, choice });
      } else if (!managed && Date.now() - lastProgress > config.idleTimeoutMs) {
        if (!waitForOpponent) throw Error('No game progress before idle timeout; use resume when opponents return');
        report({ event: 'waiting-for-opponent', game: mod.game?.id });
        lastProgress = Date.now();
      }
      await delay(config.pollMs, undefined, { signal });
    }
  } finally {
    app.connection.removeListener('runner-error', onError);
    await conversation.close();
  }
}
module.exports = { play, providerFor };
