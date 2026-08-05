/**
 * Public RedSquare capabilities for modules which consume tweets and threads.
 *
 * This adapter deliberately delegates storage, composition, rendering and
 * propagation to RedSquare. Consumers never need to import RedSquare classes.
 */
class RedSquareApi {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  registerPeer(peer) {
    if (!peer || typeof this.mod.registerPeer !== 'function') {
      return false;
    }

    this.mod.registerPeer(peer);
    return true;
  }

  composeRoot({ text = '', prompt = '' } = {}) {
    return this.openComposer({ mode: 'post', text, prompt });
  }

  async composeReply({
    root_tx_sig,
    parent_tx_sig,
    text = '',
    prompt = '',
    publishImmediately = false
  } = {}) {
    const context = await this.resolveTweet({
      root_tx_sig,
      source_tx_sig: parent_tx_sig
    });
    const parent = this.mod.getTweet(context.source_tx_sig);

    if (!parent) {
      throw new Error('RedSquare reply parent is unavailable');
    }

    if (publishImmediately) {
      const body = String(text || '').trim();
      if (!body) {
        throw new Error('A reply must contain text');
      }

      return this.publishReply(parent, context.root_tx_sig, body);
    }

    return this.openComposer({ mode: 'reply', reply_to: parent, text, prompt });
  }

  async resolveTweet({ root_tx_sig, source_tx_sig } = {}) {
    const requestedRoot = String(root_tx_sig || '');
    const requestedSource = String(source_tx_sig || '');

    if (!requestedRoot || !requestedSource) {
      throw new Error('RedSquare root and source transaction signatures are required');
    }

    const source = await this.loadTweet(requestedSource);
    if (!source) {
      throw new Error('RedSquare source transaction was not found');
    }

    const isRoot = source.signature === requestedRoot;
    const hasExpectedThread = String(source.thread_id || source.signature) === requestedRoot;
    if (!isRoot && (!hasExpectedThread || !(await this.hasAncestor(source, requestedRoot)))) {
      throw new Error('RedSquare source transaction is not in the supplied thread');
    }

    const root = await this.loadTweet(requestedRoot);
    if (!root) {
      throw new Error('RedSquare root transaction was not found');
    }

    return {
      root_tx_sig: requestedRoot,
      source_tx_sig: source.signature,
      reporter_publickey: source.publicKey || source.tx?.from?.[0]?.publicKey || '',
      transaction: source.tx
    };
  }

  async resolveReplyRoot(transaction) {
    const msg = transaction?.returnMessage?.() || transaction?.msg || {};
    const data = msg.data || {};

    if (data.thread_id) {
      return String(data.thread_id);
    }

    const signature = String(transaction?.signature || '');
    if (signature) {
      const tweet = await this.loadTweet(signature);
      if (tweet) {
        return this.resolveTweetRoot(tweet);
      }
    }

    if (data.parent_id) {
      const parent = await this.loadTweet(data.parent_id);
      if (parent) {
        return this.resolveTweetRoot(parent);
      }
    }

    return '';
  }

  async renderThread(
    container,
    { root_tx_sig, source_tx_sig, reply = true } = {}
  ) {
    this.ensureTweetStyles();
    const context = await this.resolveTweet({ root_tx_sig, source_tx_sig });
    await this.mod.loadTweetThread(context.source_tx_sig);

    const host = typeof container === 'string' ? document.querySelector(container) : container;
    if (!host) {
      throw new Error('RedSquare thread container was not found');
    }

    const selector = this.ensureSelector(host);
    const source = this.mod.getTweet(context.source_tx_sig);
    if (!source) {
      throw new Error('RedSquare source transaction was not found');
    }

    host.innerHTML = '';
    source.render(selector, { focused: true, presentation: 'focused' });

    if (reply) {
      const children = (this.mod.tweets_children?.[source.signature] || [])
        .map((signature) => this.mod.getTweet(signature))
        .filter(Boolean)
        .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));

      for (const child of children) {
        child.render(selector, { reply: true, presentation: 'reply' });
      }
    }

    this.attachThreadEvents(host);
    return () => {
      if (host.isConnected) {
        host.innerHTML = '';
      }
    };
  }

  async openThread({ root_tx_sig, source_tx_sig } = {}) {
    const context = await this.resolveTweet({ root_tx_sig, source_tx_sig });

    if (this.mod.browser_active && this.mod.manager) {
      await this.mod.manager.renderThread(context.source_tx_sig);
      return context.source_tx_sig;
    }

    const path = `/${encodeURI(this.mod.returnSlug())}/tweet/${encodeURIComponent(
      context.source_tx_sig
    )}`;
    if (typeof navigateWindow === 'function') {
      navigateWindow(path);
    } else if (typeof window !== 'undefined') {
      window.location.assign(path);
    }

    return context.source_tx_sig;
  }

  openComposer(options) {
    if (!this.mod.compose_overlay?.open) {
      throw new Error('RedSquare composer is unavailable');
    }

    return new Promise((resolve) => {
      this.mod.compose_overlay.open({ ...options, onComplete: resolve });
    });
  }

  async publishReply(parent, rootTxSig, text) {
    const keys = this.collectRecipientKeys(parent);
    const tx = await this.mod.createTweetTransaction(
      {
        text,
        parent_id: parent.signature,
        thread_id: rootTxSig
      },
      keys
    );

    await tx.sign();
    await this.app.network.propagateTransaction(tx);
    const tweet = await this.mod.receiveTweetTransaction(tx);
    if (tweet) {
      this.mod.manager?.onTweetPosted(tweet);
    }
    return tx;
  }

  collectRecipientKeys(tweet) {
    const keys = [];
    const add = (publicKey) => {
      if (publicKey && !keys.includes(publicKey)) {
        keys.push(publicKey);
      }
    };

    add(tweet?.publicKey);
    for (const slip of tweet?.tx?.to || []) {
      add(slip?.publicKey);
    }
    return keys;
  }

  async loadTweet(signature) {
    return this.mod.getTweet(signature) || (await this.mod.loadTweetThread(signature));
  }

  async resolveTweetRoot(tweet) {
    if (tweet.thread_id) {
      return String(tweet.thread_id);
    }

    let current = tweet;
    const visited = new Set();
    while (current?.parent_id && !visited.has(current.signature)) {
      visited.add(current.signature);
      const parent = await this.loadTweet(current.parent_id);
      if (!parent) {
        break;
      }
      current = parent;
    }
    return String(current?.signature || '');
  }

  async hasAncestor(tweet, expectedSignature) {
    let current = tweet;
    const visited = new Set();

    while (current?.parent_id && !visited.has(current.signature)) {
      if (current.parent_id === expectedSignature) {
        return true;
      }

      visited.add(current.signature);
      current = await this.loadTweet(current.parent_id);
    }

    return current?.signature === expectedSignature;
  }

  ensureSelector(host) {
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(host.id || '')) {
      return `#${host.id}`;
    }

    host.id = `redsquare-thread-${Math.random().toString(36).slice(2)}`;
    return `#${host.id}`;
  }

  ensureTweetStyles() {
    this.app.browser?.addStylesheet?.('/redsquare/css/redsquare-tweet.css');
  }

  attachThreadEvents(host) {
    const manager = this.mod.manager;
    if (!manager) {
      return;
    }

    manager.attachTweetNavigation(host);
    manager.attachTweetImageViewer(host);
    manager.attachThreadContext(host);
    manager.attachTweetMenu(host);
    manager.attachTweetReply(host);
    manager.attachTweetLike(host);
    manager.attachTweetRetweet(host);
    manager.attachTweetShare(host);
  }
}

module.exports = RedSquareApi;
