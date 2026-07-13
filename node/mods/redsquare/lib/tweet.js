const TweetTemplate = require('./tweet.template');

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
    this.is_reply = false;
    this.critical_child = null;
    this.time = '';

    if (this.tx) {
      this.parseFromTransaction();
    }
  }

  updateFromTransaction(tx) {
    this.tx = tx || this.tx;
    this.parseFromTransaction();
  }

  parseFromTransaction() {
    const txmsg = this.returnTxMessage();
    const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
    const optional = this.tx.optional && typeof this.tx.optional === 'object' ? this.tx.optional : {};

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
    this.updated_at = Number(optional.edit_ts) || this.created_at;

    this.likes = Number(optional.num_likes) || 0;
    this.replies = Number(optional.num_replies) || 0;
    this.retweets = Number(optional.num_retweets) || 0;

    this.curated = optional.curated ? 1 : 0;
    this.flagged = optional.flagged ? 1 : 0;
    this.is_reply = this.parent_id !== '';

    this.publicKey = this.extractPublicKey();
    this.resolveAuthor(this.publicKey);
    this.time = this.formatRelativeTime(this.created_at);
  }

  returnTxMessage() {
    if (this.tx && typeof this.tx.returnMessage === 'function') {
      return this.tx.returnMessage();
    }

    return this.tx && this.tx.msg && typeof this.tx.msg === 'object' ? this.tx.msg : {};
  }

  extractPublicKey() {
    if (this.tx && this.tx.from && this.tx.from[0] && this.tx.from[0].publicKey) {
      return String(this.tx.from[0].publicKey);
    }

    return '';
  }

  resolveAuthor(publicKey) {
    const authors = this.mod.mockAuthors || {};
    const known = authors[publicKey];

    if (known) {
      this.username = known.name;
      this.handle = known.handle;
      this.avatar = known.avatar;
      return;
    }

    const shortKey = publicKey ? publicKey.slice(0, 8) : 'anon';

    this.username = shortKey;
    this.handle = shortKey;
    this.avatar = '/saito/img/dreamscape.png';
  }

  formatRelativeTime(timestamp) {
    const diffMs = Math.max(0, Date.now() - Number(timestamp));
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 60) {
      return `${Math.max(1, diffMinutes)}m`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
      return `${diffHours}h`;
    }

    const diffDays = Math.floor(diffHours / 24);

    return `${diffDays}d`;
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
    const embedded = {
      signature: raw.signature != null ? String(raw.signature) : '',
      publicKey,
      username: raw.username != null ? String(raw.username) : 'anon',
      handle: raw.handle != null ? String(raw.handle) : 'anon',
      avatar: raw.avatar != null ? String(raw.avatar) : '/saito/img/dreamscape.png',
      created_at,
      text: raw.text != null ? String(raw.text) : '',
      images: Array.isArray(raw.images) ? raw.images.slice(0, 4) : [],
      embedded: null,
      likes: Number(raw.likes) || 0,
      replies: Number(raw.replies) || 0,
      retweets: Number(raw.retweets) || 0,
      time: raw.time != null ? String(raw.time) : this.formatRelativeTime(created_at)
    };

    if (!raw.username && publicKey) {
      this.resolveAuthorFor(embedded, publicKey);
    }

    return embedded;
  }

  resolveAuthorFor(target, publicKey) {
    const authors = this.mod.mockAuthors || {};
    const known = authors[publicKey];

    if (known) {
      target.username = known.name;
      target.handle = known.handle;
      target.avatar = known.avatar;
      return;
    }

    const shortKey = publicKey ? publicKey.slice(0, 8) : 'anon';

    target.username = shortKey;
    target.handle = shortKey;
    target.avatar = '/saito/img/dreamscape.png';
  }

  renderHTML(className = 'tweet') {
    return TweetTemplate(this, className);
  }

  buildClassName(options = {}) {
    const classes = ['tweet'];

    if (options.focused) {
      classes.push('focused');
    } else if (this.is_reply && !options.chainPrev) {
      classes.push('is-reply');
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

    return classes.join(' ');
  }

  render(container = '', options = {}) {
    if (container) {
      this.container = container;
    }

    const className = this.buildClassName(options);
    this.app.browser.addElementToSelector(TweetTemplate(this, className), this.container);
  }
}

module.exports = Tweet;
