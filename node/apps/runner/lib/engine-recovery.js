const { setTimeout: delay } = require('node:timers/promises');
const endGame = require('./end-game');

class EngineRecovery {
  constructor(runtime, config, { signal, report, sleep = delay } = {}) {
    this.runtime = runtime; this.signal = signal; this.report = report; this.sleep = sleep;
    this.maxAttempts = config.decisionProvider.maxAttempts ?? 3;
    this.retryDelayMs = config.decisionProvider.retryDelayMs ?? 30000;
    this.failures = 0;
  }
  reset() { this.failures = 0; }
  async failed(error, decisionId) {
    if (error.code !== 'ENGINE_UNAVAILABLE') throw error;
    const { app, mod, adapter } = this.runtime;
    this.failures++;
    this.report({ event: 'engine-unavailable', attempt: this.failures, message: error.message });
    while (!this.signal?.aborted) {
      if (mod.game.over || adapter.current()?.id !== decisionId) { this.reset(); return; }
      const reachable = await this.runtime.isSaitoReachable(this.signal);
      this.signal?.throwIfAborted();
      if (mod.game.over || adapter.current()?.id !== decisionId) { this.reset(); return; }
      if (!reachable) {
        // Failures during a general outage do not consume the engine retry budget.
        this.reset();
        this.report({ event: 'waiting-for-network', game: mod.game.id });
      } else if (this.failures < this.maxAttempts) {
        this.report({ event: 'engine-retry', game: mod.game.id, delayMs: this.retryDelayMs });
        await this.sleep(this.retryDelayMs, undefined, { signal: this.signal });
        return;
      } else {
        const finished = await this.runtime.runExclusive(async () => {
          if (mod.game.over || adapter.current()?.id !== decisionId) return true;
          const opponents = mod.game.players.filter(key => key !== mod.publicKey);
          let state = app.options.runnerEngineForfeit;
          if (state?.game !== mod.game.id) state = app.options.runnerEngineForfeit = { game: mod.game.id, notified: [] };
          for (const opponent of opponents) {
            if (state.notified.includes(opponent)) continue;
            try {
              if (!await this.runtime.chat.send(opponent, 'direct',
                'Sorry, my decision engine is unavailable after repeated attempts. I cannot continue, so I am forfeiting this game.')) throw Error('Could not send forfeit notice');
            } catch (noticeError) {
              this.report({ event: 'forfeit-notice-failed', message: noticeError.message });
              return false;
            }
            state.notified.push(opponent); app.storage.saveOptions();
          }
          await endGame(this.runtime, opponents, 'forfeit');
          // Do not immediately accept another match with the same broken engine.
          app.options.runnerEngineRetryAt = Date.now() + 300000;
          app.storage.saveOptions();
          this.report({ event: 'engine-forfeit', game: mod.game.id, matchmakingDelayMs: 300000 });
          return true;
        });
        if (finished) return;
      }
      await this.sleep(this.retryDelayMs, undefined, { signal: this.signal });
    }
    this.signal?.throwIfAborted();
  }
}
module.exports = EngineRecovery;
