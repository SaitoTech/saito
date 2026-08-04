const TweetTemplate = require('./tweet.template');

function returnMessage(tx) {
  if (tx && typeof tx.returnMessage === 'function') {
    return tx.returnMessage();
  }

  return tx && tx.msg && typeof tx.msg === 'object' ? tx.msg : {};
}

function authorFromPublicKey(app, publicKey) {
  if (!publicKey) {
    return {
      username: 'anon',
      handle: '',
      avatar: '/saito/img/dreamscape.png'
    };
  }

  // Display name from keychain (registered identifier or Anon-xxxxxx).
  // Meta/handle storage is the raw public key — never an @username, never duplicate the name.
  const username = app.keychain.returnUsername(publicKey) || `Anon-${publicKey.slice(0, 6)}`;
  const handle = publicKey;
  const avatar = app.keychain.returnIdenticon(publicKey) || '/saito/img/dreamscape.png';

  return { username, handle, avatar };
}

class Tweet {
  constructor(app, mod, tx) {
    this.app = app;
    this.mod = mod;
    this.container = '';
    this.tx = tx || null;

    this.signature = '';
    this.parent_id = '';
    this.thread_id = '';
    this.publicKey = '';
    this.username = 'anon';
    this.handle = 'anon';
    this.avatar = '/saito/img/dreamscape.png';
    this.created_at = Date.now();
    this.updated_at = this.created_at;
    this.text = '';
    this.images = [];
    this.embedded = null;
    this.link = '';
    this.likes = 0;
    this.replies = 0;
    this.retweets = 0;
    this.curated = 0;
    this.flagged = 0;
    this.moderated = false;
    this.moderated_revealed = false;
    this.is_reply = false;
    this.critical_child = null;
    this.time = '';
    this.likers = [];
    this.retweeters = [];

    if (this.tx) {
      this.parseFromTransaction();
    }
  }

  updateFromTransaction(tx) {
    const previousOptional =
      this.tx && this.tx.optional && typeof this.tx.optional === 'object' ? this.tx.optional : {};
    const previousLikes = Number(this.likes) || Number(previousOptional.num_likes) || 0;
    const previousReplies = Number(this.replies) || Number(previousOptional.num_replies) || 0;
    const previousRetweets = Number(this.retweets) || Number(previousOptional.num_retweets) || 0;
    const previousLikers = Array.isArray(previousOptional.likers)
      ? previousOptional.likers.slice()
      : Array.isArray(this.likers)
        ? this.likers.slice()
        : [];
    const previousRetweeters = Array.isArray(previousOptional.retweeters)
      ? previousOptional.retweeters.slice()
      : Array.isArray(this.retweeters)
        ? this.retweeters.slice()
        : [];
    const previousRetweetedAt = Number(previousOptional.retweeted_at) || 0;
    const previousUpdatedAt =
      Number(this.updated_at) ||
      Number(previousOptional.updated_at) ||
      Number(this.tx?.timestamp) ||
      0;

    this.tx = tx || this.tx;
    this.parseFromTransaction();

    if (!this.tx.optional || typeof this.tx.optional !== 'object') {
      this.tx.optional = {};
    }

    const incomingOptional = this.tx.optional;
    const incomingLikers = Array.isArray(incomingOptional.likers) ? incomingOptional.likers : [];
    this.tx.optional.likers = Array.from(new Set([...incomingLikers, ...previousLikers]));

    this.tx.optional.num_replies = Math.max(
      previousReplies,
      Number(incomingOptional.num_replies) || 0
    );
    this.tx.optional.num_likes = Math.max(
      previousLikes,
      Number(incomingOptional.num_likes) || 0,
      this.tx.optional.likers.length
    );
    this.tx.optional.num_retweets = Math.max(
      previousRetweets,
      Number(incomingOptional.num_retweets) || 0
    );

    this.replies = this.tx.optional.num_replies;
    this.likes = this.tx.optional.num_likes;
    this.retweets = this.tx.optional.num_retweets;
    this.likers = this.tx.optional.likers.slice();

    if (Number(incomingOptional.num_retweets) > previousRetweets) {
      if (Array.isArray(incomingOptional.retweeters)) {
        this.tx.optional.retweeters = incomingOptional.retweeters.slice();
      }
      if (incomingOptional.retweeted_at != null) {
        this.tx.optional.retweeted_at = incomingOptional.retweeted_at;
      }
    } else if (previousRetweets > Number(incomingOptional.num_retweets) || 0) {
      this.tx.optional.retweeters = previousRetweeters.slice();
      if (previousRetweetedAt > 0) {
        this.tx.optional.retweeted_at = previousOptional.retweeted_at;
      }
    } else {
      const incomingRetweeters = Array.isArray(incomingOptional.retweeters)
        ? incomingOptional.retweeters
        : [];
      this.tx.optional.retweeters =
        incomingRetweeters.length >= previousRetweeters.length
          ? incomingRetweeters.slice()
          : previousRetweeters.slice();

      const incomingRetweetedAt = Number(incomingOptional.retweeted_at) || 0;
      if (incomingRetweetedAt >= previousRetweetedAt && incomingRetweetedAt > 0) {
        this.tx.optional.retweeted_at = incomingOptional.retweeted_at;
      } else if (previousRetweetedAt > 0) {
        this.tx.optional.retweeted_at = previousOptional.retweeted_at;
      }
    }

    this.retweeters = Array.isArray(this.tx.optional.retweeters)
      ? this.tx.optional.retweeters.slice()
      : [];

    const mergedUpdatedAt = Math.max(
      previousUpdatedAt,
      Number(incomingOptional.updated_at) || Number(this.updated_at) || 0
    );

    if (mergedUpdatedAt > 0) {
      this.tx.optional.updated_at = mergedUpdatedAt;
      this.updated_at = mergedUpdatedAt;
    }

    const statsChanged =
      this.likes !== previousLikes ||
      this.replies !== previousReplies ||
      this.retweets !== previousRetweets;

    if (statsChanged) {
      this.refreshControls();
    }
  }

  parseFromTransaction() {
    const txmsg = returnMessage(this.tx);
    const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
    const optional =
      this.tx.optional && typeof this.tx.optional === 'object' ? this.tx.optional : {};

    this.signature = this.tx.signature != null ? String(this.tx.signature) : '';
    this.text = data.text != null ? String(data.text) : '';
    this.parent_id = data.parent_id != null ? String(data.parent_id) : '';
    this.thread_id =
      data.thread_id != null && String(data.thread_id) !== ''
        ? String(data.thread_id)
        : this.signature;
    this.link = data.link != null ? String(data.link) : '';

    const images = data.images;
    this.images = Array.isArray(images) ? images.slice() : images ? [images] : [];

    this.embedded = this.normalizeEmbedded(data.embedded);

    this.created_at = Number(this.tx.timestamp) || Date.now();
    this.updated_at = Number(optional.updated_at) || Number(optional.edit_ts) || this.created_at;

    this.likes = Number(optional.num_likes) || 0;
    this.replies = Number(optional.num_replies) || 0;
    this.retweets = Number(optional.num_retweets) || 0;
    this.likers = Array.isArray(optional.likers) ? optional.likers.slice() : [];
    this.retweeters = Array.isArray(optional.retweeters) ? optional.retweeters.slice() : [];

    this.curated = optional.curated ? 1 : 0;
    this.flagged = optional.flagged ? 1 : 0;
    this.is_reply = this.parent_id !== '';

    this.publicKey = this.extractPublicKey();
    const author = authorFromPublicKey(this.app, this.publicKey);

    this.username = author.username;
    this.handle = author.handle;
    this.avatar = author.avatar;
    this.time = this.app.browser.formatRelativeTime(this.created_at);
  }

  extractPublicKey() {
    if (this.tx && this.tx.from && this.tx.from[0] && this.tx.from[0].publicKey) {
      return String(this.tx.from[0].publicKey);
    }

    return '';
  }

  normalizeEmbedded(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    if (raw instanceof Tweet) {
      return raw;
    }

    const created_at = Number(raw.created_at) || Date.now();
    const publicKey = raw.publicKey != null ? String(raw.publicKey) : '';
    const author = authorFromPublicKey(this.app, publicKey);
    const embedded = {
      signature: raw.signature != null ? String(raw.signature) : '',
      publicKey,
      username: raw.username != null ? String(raw.username) : author.username,
      handle: raw.handle != null ? String(raw.handle) : author.handle,
      avatar: raw.avatar != null ? String(raw.avatar) : author.avatar,
      created_at,
      text: raw.text != null ? String(raw.text) : '',
      images: Array.isArray(raw.images) ? raw.images.slice(0, 4) : [],
      embedded: null,
      likes: Number(raw.likes) || 0,
      replies: Number(raw.replies) || 0,
      retweets: Number(raw.retweets) || 0,
      time: raw.time != null ? String(raw.time) : this.app.browser.formatRelativeTime(created_at)
    };

    return embedded;
  }

  renderHTML(className = 'tweet') {
    return TweetTemplate(this, className);
  }

  buildClassName(options = {}) {
    const presentation =
      options.presentation ||
      (options.embedded
        ? 'embedded'
        : options.focused
          ? 'focused'
          : options.root
            ? 'root'
            : options.reply
              ? 'reply'
              : 'timeline');

    // Default timeline presentation has no modifier — root is just `.tweet`.
    const classes = ['tweet'];

    if (presentation && presentation !== 'timeline') {
      classes.push(presentation);
    }

    if (options.focused && presentation !== 'focused') {
      classes.push('focused');
    }

    if (options.chainPrev) {
      classes.push('chain-prev');
    }

    if (options.chainNext) {
      classes.push('chain-next');
    }

    if (options.chainContinue) {
      classes.push('chain-continue');
    }

    if (this.showsModerationMask()) {
      classes.push('moderated');
    }

    return classes.join(' ');
  }

  showsModerationMask() {
    return Boolean(this.flagged) || Boolean(this.moderated && !this.moderated_revealed);
  }

  /**
   * Replace already-rendered tweet nodes in place (no timeline rebuild).
   */
  refresh() {
    if (!this.app.BROWSER || !this.signature) {
      return;
    }

    const nodes = document.querySelectorAll(`article.tweet[data-id="${this.signature}"]`);

    if (!nodes.length) {
      return;
    }

    for (const el of nodes) {
      const className = this.syncModeratedClassName(el.className || 'tweet');
      const html = TweetTemplate(this, className, {
        presentation: this.presentationFromClassName(className),
        embedded: /\bembedded\b/.test(className),
        focused: /\bfocused\b/.test(className),
        root: /\broot\b/.test(className),
        reply: /\breply\b/.test(className),
        chainPrev: /\bchain-prev\b/.test(className),
        chainNext: /\bchain-next\b/.test(className),
        chainContinue: /\bchain-continue\b/.test(className)
      });
      el.outerHTML = html;
    }

    this.attachModerationEvents();
  }

  syncModeratedClassName(className = 'tweet') {
    const classes = new Set(
      String(className)
        .split(/\s+/)
        .filter(Boolean)
    );

    classes.add('tweet');

    if (this.showsModerationMask()) {
      classes.add('moderated');
    } else {
      classes.delete('moderated');
    }

    return Array.from(classes).join(' ');
  }

  presentationFromClassName(className = '') {
    if (/\bembedded\b/.test(className)) {
      return 'embedded';
    }
    if (/\bfocused\b/.test(className)) {
      return 'focused';
    }
    if (/\broot\b/.test(className)) {
      return 'root';
    }
    if (/\breply\b/.test(className)) {
      return 'reply';
    }
    return 'timeline';
  }

  attachModerationEvents() {
    if (!this.app.BROWSER || !this.signature || this.flagged || !this.showsModerationMask()) {
      return;
    }

    const buttons = document.querySelectorAll(
      `article.tweet[data-id="${this.signature}"] .show-tweet`
    );

    for (const button of buttons) {
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.moderated_revealed = true;
        this.refresh();
      };
    }
  }

  incrementStat(field) {
    const optionalKey =
      field === 'likes' ? 'num_likes' : field === 'retweets' ? 'num_retweets' : 'num_replies';

    if (!this.tx) {
      return this;
    }

    if (!this.tx.optional || typeof this.tx.optional !== 'object') {
      this.tx.optional = {};
    }

    const current = Number(this[field]) || Number(this.tx.optional[optionalKey]) || 0;
    const next = current + 1;

    this[field] = next;
    this.tx.optional[optionalKey] = next;

    return this;
  }

  refreshControls() {
    if (!this.app.BROWSER || !this.signature) {
      return;
    }

    const selectors = [
      ['comment', this.replies],
      ['like', this.likes],
      ['retweet', this.retweets]
    ];

    for (const [tool, count] of selectors) {
      const nodes = document.querySelectorAll(
        `article.tweet[data-id="${this.signature}"] .tool.${tool} .count`
      );

      for (const node of nodes) {
        node.textContent = String(count);
      }
    }
  }

  render(container = '', options = {}) {
    if (container) {
      this.container = container;
    }

    const className = this.buildClassName(options);
    this.app.browser.addElementToSelector(
      TweetTemplate(this, className, {
        ...options,
        presentation:
          options.presentation ||
          (options.embedded
            ? 'embedded'
            : options.focused
              ? 'focused'
              : options.root
                ? 'root'
                : options.reply
                  ? 'reply'
                  : 'timeline')
      }),
      this.container
    );

    this.attachModerationEvents();
  }
}

module.exports = Tweet;
