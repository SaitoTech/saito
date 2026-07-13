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
      handle: 'anon',
      avatar: '/saito/img/dreamscape.png'
    };
  }

  const username = app.keychain.returnUsername(publicKey) || publicKey.slice(0, 8);
  const handle = app.keychain.returnIdentifierByPublicKey(publicKey, true) || publicKey.slice(0, 8);
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
    const txmsg = returnMessage(this.tx);
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
      time:
        raw.time != null ? String(raw.time) : this.app.browser.formatRelativeTime(created_at)
    };

    return embedded;
  }

  renderHTML(className = 'tweet') {
    return TweetTemplate(this, className);
  }

  buildClassName(options = {}) {
    const classes = ['tweet'];

    if (options.focused) {
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

    return classes.join(' ');
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

  render(container = '', options = {}) {
    if (container) {
      this.container = container;
    }

    const className = this.buildClassName(options);
    this.app.browser.addElementToSelector(TweetTemplate(this, className), this.container);
  }
}

module.exports = Tweet;
