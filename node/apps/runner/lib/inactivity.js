const WARN_AFTER = 5 * 60 * 1000;
const REPLY_WITHIN = 60 * 1000;
const EXTENSION = 5 * 60 * 1000;

// Installation-local timers survive a daemon restart. Only game progress resets
// an extension; repeated chat messages cannot keep an abandoned game reserved.
class Inactivity {
  constructor(runtime, report = () => {}) {
    this.runtime = runtime;
    this.report = report;
  }

  async tick(revision, hasDecision, now = Date.now()) {
    const { app, mod, chat } = this.runtime;
    const game = mod.game;
    const opponents = game?.players?.filter(key => key !== mod.publicKey) || [];
    if (!chat || !opponents.length || game.over) return false;
    const save = () => app.storage.saveOptions();
    let state = app.options.runnerInactivity;
    if (!state || state.game !== game.id || state.revision !== revision || hasDecision) {
      app.options.runnerInactivity = { game: game.id, revision, lastProgress: now };
      save();
      return true;
    }
    if (now - state.lastProgress < WARN_AFTER) return true;
    if (!state.warnedAt) {
      for (const opponent of opponents) {
        const sent = await chat.send(opponent, 'direct',
          `No move has been made in our ${game.module} game for 5 minutes. I will cancel the game in 1 minute unless you reply here or play a move. A reply gives you another 5 minutes to play.`);
        if (!sent) throw Error('Could not send inactivity warning');
      }
      state.warnedAt = now;
      state.deadline = now + REPLY_WITHIN;
      save();
      this.report({ event: 'inactivity-warning', game: game.id, deadline: state.deadline });
      return true;
    }
    if (!state.extended) {
      const reply = chat.messages.find(message => opponents.includes(message.sender) &&
        !message.automated && message.channel === 'direct' && message.timestamp >= state.warnedAt &&
        message.timestamp <= now && message.receivedAt >= state.warnedAt &&
        message.receivedAt < state.deadline && message.text.trim());
      if (reply) {
        state.extended = true;
        state.replySignature = reply.signature;
        state.deadline = reply.receivedAt + EXTENSION;
        save();
        await chat.send(reply.sender, 'direct', 'Thanks. You have another 5 minutes to play a move before I cancel the game.');
        this.report({ event: 'inactivity-extension', game: game.id, deadline: state.deadline });
      }
    }
    if (now >= state.deadline) {
      await require('./end-game')(this.runtime);
      this.report({ event: 'inactivity-cancelled', game: game.id });
    }
    return true;
  }
}
module.exports = { Inactivity, WARN_AFTER, REPLY_WITHIN, EXTENSION };
