const GREETING = "GLHF! I'm a Saito runner bot. Have fun!";
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const plain = text => text.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim().slice(0, 2000);

class Conversation {
  constructor(runtime, provider, { signal, report = () => {} } = {}) {
    this.runtime = runtime; this.provider = provider; this.report = report;
    this.controller = new AbortController();
    this.signal = signal;
    this.abort = () => this.controller.abort();
    signal?.addEventListener('abort', this.abort, { once: true });
    if (signal?.aborted) this.abort();
    this.pending = null;
  }

  async tick(now = Date.now()) {
    const job = await this.runtime.runExclusive(() => this.prepare(now));
    if (!job) return;
    const { state, message, game, context } = job;
    const { app, mod, chat } = this.runtime;
    // Start outside runExclusive's AsyncLocalStorage context. Background model
    // callbacks must acquire the queue afresh before sending their reply.
    this.pending = Promise.resolve().then(() => this.provider.reply(context, this.controller.signal)).then(reply =>
      this.runtime.runExclusive(async () => {
        if (this.controller.signal.aborted || mod.game?.id !== state.game || mod.game.over || !mod.game.players.includes(message.sender)) return;
        if (typeof reply !== 'string' || reply.length > 500) throw Error('Invalid chat reply');
        if (!reply.trim()) return;
        if (!await chat.send(message.sender, 'direct', escapeHtml(reply.trim()))) throw Error('Could not send chat reply');
        state.history[message.sender].push({ role: 'bot', text: reply.trim() });
        state.history[message.sender] = state.history[message.sender].slice(-8);
        app.storage.saveOptions();
        this.report({ event: 'chat-replied', game: game.id, opponent: message.sender });
      })
    ).catch(error => {
      if (!this.controller.signal.aborted) this.report({ event: 'chat-error', message: error.message });
    }).finally(() => { this.pending = null; });
  }

  async prepare(now) {
    const { app, mod, chat } = this.runtime, game = mod.game;
    if (!chat || !game?.players_set || !game.id || game.over || this.controller.signal.aborted) return;
    const opponents = game.players.filter(key => key !== mod.publicKey);
    if (!opponents.length) return;
    let state = app.options.runnerConversation;
    if (!state || state.game !== game.id) {
      state = app.options.runnerConversation = { game: game.id, startedAt: now, greeted: [], handled: [], history: {}, nextReplyAt: 0 };
      app.storage.saveOptions();
    }
    for (const opponent of opponents) {
      if (state.greeted.includes(opponent)) continue;
      // Claim before send, as with invitation consent: restart cannot duplicate
      // a greeting if the process dies after transmission but before saving.
      state.greeted.push(opponent); app.storage.saveOptions();
      try {
        if (!await chat.send(opponent, 'direct', GREETING)) throw Error('Could not send greeting');
        this.report({ event: 'chat-greeting', game: game.id, opponent });
      } catch (error) { this.report({ event: 'chat-error', message: error.message }); }
    }
    if (this.pending || !this.provider.reply || now < state.nextReplyAt) return;
    const message = chat.messages.find(m => opponents.includes(m.sender) && m.channel === 'direct' && !m.automated &&
      m.signature && !state.handled.includes(m.signature) && m.timestamp >= state.startedAt && m.timestamp <= now + 30000 && plain(m.text));
    if (!message) return;
    // Inactivity already acknowledges the message granting its one extension.
    if (app.options.runnerInactivity?.replySignature === message.signature) {
      state.handled.push(message.signature); app.storage.saveOptions(); return;
    }
    state.handled.push(message.signature);
    state.handled = state.handled.slice(-1000);
    state.nextReplyAt = now + 10000;
    const history = state.history[message.sender] ||= [];
    history.push({ role: 'opponent', text: plain(message.text) });
    state.history[message.sender] = history.slice(-8);
    app.storage.saveOptions();
    const context = { game: game.module, messages: state.history[message.sender].map(m => ({ ...m })) };
    return { state, message, game, context };
  }

  async close() {
    this.controller.abort();
    this.signal?.removeEventListener('abort', this.abort);
    await this.pending;
  }
}
module.exports = { Conversation, GREETING };
