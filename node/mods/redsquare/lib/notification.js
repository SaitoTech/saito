const NotificationTemplate = require('./notification.template');
const TweetTemplate = require('./tweet.template');

function returnMessage(tx) {
  if (tx && typeof tx.returnMessage === 'function') {
    return tx.returnMessage();
  }

  return tx && tx.msg && typeof tx.msg === 'object' ? tx.msg : {};
}

class Notification {
  constructor(app, mod, data = {}) {
    this.app = app;
    this.mod = mod;
    this.container = '';
    this.tx = null;

    this.signature = '';
    this.tweet_signature = '';
    this.type = '';
    this.actor_publicKey = '';
    this.actor_name = '';
    this.actor_avatar = '/saito/img/dreamscape.png';
    this.text = '';
    this.likers = [];
    this.created_at = Date.now();
    this.time = '';

    if (data && data.tx) {
      this.tx = data.tx;
      this.parseFromTransaction();
      return;
    }

    this.parseFromData(data);
  }

  static fromTransaction(app, mod, tx) {
    return new Notification(app, mod, { tx });
  }

  parseFromTransaction() {
    if (!this.tx) {
      return;
    }

    const txmsg = returnMessage(this.tx);
    const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};

    this.signature = this.tx.signature != null ? String(this.tx.signature) : '';
    this.created_at = Number(this.tx.timestamp) || Date.now();
    this.actor_publicKey = this.extractPublicKey();
    this.applyActor(this.actor_publicKey);
    this.time = this.app.browser.formatRelativeTime(this.created_at);

    if (txmsg.request === 'like tweet') {
      this.type = 'like';
      this.tweet_signature = data.signature != null ? String(data.signature) : '';
      this.likers = [{ publicKey: this.actor_publicKey, name: this.actor_name, count: 1 }];
      this.text = `${this.actor_name} liked your post`;
    } else if (txmsg.request === 'retweet') {
      const hasCommentary =
        Boolean(String(data.text || '').trim()) ||
        (Array.isArray(data.images) && data.images.length > 0);

      this.type = hasCommentary ? 'quote' : 'retweet';
      this.tweet_signature = data.signature != null ? String(data.signature) : '';
      this.text = hasCommentary
        ? `${this.actor_name} quoted your post`
        : `${this.actor_name} reposted your post`;
    } else if (txmsg.request === 'create tweet') {
      this.type = data.parent_id ? 'reply' : 'tweet';
      this.tweet_signature = this.signature;
      this.text = data.parent_id
        ? `${this.actor_name} posted a new reply`
        : `${this.actor_name} posted a new tweet`;
    } else {
      this.type = data.type != null ? String(data.type) : '';
      this.tweet_signature =
        data.tweet_signature != null
          ? String(data.tweet_signature)
          : data.signature != null
            ? String(data.signature)
            : '';
      this.text =
        data.text != null ? String(data.text) : `${this.actor_name} sent you a notification`;
    }
  }

  parseFromData(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    this.signature = data.signature != null ? String(data.signature) : '';
    this.tweet_signature = data.tweet_signature != null ? String(data.tweet_signature) : '';
    this.type = data.type != null ? String(data.type) : '';
    this.actor_publicKey = data.actor_publicKey != null ? String(data.actor_publicKey) : '';
    this.actor_name = data.actor_name != null ? String(data.actor_name) : '';
    this.actor_avatar =
      data.actor_avatar != null ? String(data.actor_avatar) : '/saito/img/dreamscape.png';
    this.text = data.text != null ? String(data.text) : '';
    this.likers = Array.isArray(data.likers) ? data.likers.slice() : [];
    this.created_at = Number(data.created_at) || Date.now();
    this.time =
      data.time != null ? String(data.time) : this.app.browser.formatRelativeTime(this.created_at);

    if (!this.actor_name && this.actor_publicKey) {
      this.applyActor(this.actor_publicKey);
    }

    if (!this.text) {
      this.text = `${this.actor_name || 'anon'} sent you a notification`;
    }
  }

  extractPublicKey() {
    if (this.tx && this.tx.from && this.tx.from[0] && this.tx.from[0].publicKey) {
      return String(this.tx.from[0].publicKey);
    }

    return '';
  }

  applyActor(publicKey) {
    if (!publicKey) {
      this.actor_name = 'anon';
      this.actor_avatar = '/saito/img/dreamscape.png';
      return;
    }

    this.actor_name = this.app.keychain.returnUsername(publicKey) || publicKey.slice(0, 8);
    this.actor_avatar = this.app.keychain.returnIdenticon(publicKey) || '/saito/img/dreamscape.png';
  }

  getReferencedTweet() {
    return this.mod.getTweet(this.tweet_signature);
  }

  renderHTML() {
    const tweet = this.getReferencedTweet();

    if (!tweet) {
      return '';
    }

    const tweetHtml = TweetTemplate(tweet, 'tweet slot', {
      presentation: 'timeline',
      hideControls: true
    });

    return NotificationTemplate(this, tweetHtml);
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    const html = this.renderHTML();

    if (!html) {
      return;
    }

    this.app.browser.addElementToSelector(html, this.container);
  }
}

module.exports = Notification;
