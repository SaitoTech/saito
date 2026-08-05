/**
 * Capability-only bridge to RedSquare.
 *
 * Bugs deliberately does not import RedSquare classes. The `redsquare-api`
 * response documented in docs/todo.md is the contract required for content and
 * thread integration. Keeping this boundary explicit lets RedSquare remain
 * the sole owner of tweets, composers, images, replies and notifications.
 */
class RedSquareBridge {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  api() {
    return (
      this.app.modules.returnFirstRespondTo?.('redsquare-api', {
        consumer: this.mod.name
      }) || null
    );
  }

  available(method) {
    return typeof this.api()?.[method] === 'function';
  }

  async call(method, ...args) {
    const api = this.api();
    if (!api || typeof api[method] !== 'function') {
      throw new Error(`RedSquare does not expose ${method} through respondTo("redsquare-api")`);
    }
    return api[method](...args);
  }

  registerPeer(peer) {
    return this.call('registerPeer', peer);
  }

  async composeRoot(options) {
    return this.call('composeRoot', options);
  }

  async composeReply(options) {
    return this.call('composeReply', options);
  }

  async renderThread(container, options) {
    return this.call('renderThread', container, options);
  }

  async resolveTweet(reference) {
    return this.call('resolveTweet', reference);
  }

  async resolveReplyRoot(tx) {
    const msg = tx?.returnMessage?.() || {};
    const data = msg.data || {};
    if (data.thread_id) return data.thread_id;
    if (!this.available('resolveReplyRoot')) return '';
    return this.call('resolveReplyRoot', tx);
  }

  async openThread(rootTxSig, sourceTxSig = rootTxSig) {
    return this.call('openThread', { root_tx_sig: rootTxSig, source_tx_sig: sourceTxSig });
  }
}

module.exports = RedSquareBridge;
