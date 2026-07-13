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
    this.link = '';
    this.likes = 0;
    this.replies = 0;
    this.retweets = 0;
    this.curated = 0;
    this.flagged = 0;
    this.is_reply = false;
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

  render(container = '') {
    if (container) {
      this.container = container;
    }

    const className = this.is_reply ? 'tweet is-reply' : 'tweet';
    this.app.browser.addElementToSelector(TweetTemplate(this, className), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Tweet;
