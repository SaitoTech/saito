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
    this.count = 1;
    this.created_at = Date.now();
    this.time = '';
    this.unread = true;

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
    } else if (txmsg.request === 'retweet') {
      this.type = 'retweet';
      this.tweet_signature = data.signature != null ? String(data.signature) : '';
    } else if (txmsg.request === 'create tweet') {
      const mentions = data.mentions;
      const hasMention = Array.isArray(mentions)
        ? mentions.length > 0
        : Boolean(mentions);

      if (hasMention) {
        this.type = 'mention';
        this.tweet_signature = this.signature;
      } else if (data.parent_id) {
        this.type = 'reply';
        this.tweet_signature = this.signature;
      } else {
        this.type = 'tweet';
        this.tweet_signature = this.signature;
      }
    } else {
      this.type = data.type != null ? String(data.type) : '';
      this.tweet_signature =
        data.tweet_signature != null
          ? String(data.tweet_signature)
          : data.signature != null
            ? String(data.signature)
            : '';
    }

    this.text = this.buildActionText();
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
    this.count = Number(data.count) > 0 ? Number(data.count) : 1;
    this.created_at = Number(data.created_at) || Date.now();
    this.time =
      data.time != null ? String(data.time) : this.app.browser.formatRelativeTime(this.created_at);
    this.unread = data.unread !== false;

    if (!this.text) {
      this.text = this.buildActionText();
    }

    if (!this.actor_name && this.actor_publicKey) {
      this.applyActor(this.actor_publicKey);
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

  buildActionText() {
    switch (this.type) {
      case 'like':
        if (this.count > 1) {
          return `liked your post (${this.count})`;
        }
        return 'liked your post';
      case 'reply':
        return 'replied to your post';
      case 'retweet':
        return 'reposted your post';
      case 'mention':
        return 'mentioned you';
      default:
        return 'sent you a notification';
    }
  }

  refreshActionText() {
    this.text = this.buildActionText();
  }

  getReferencedTweet() {
    return this.mod.getTweet(this.tweet_signature);
  }

  renderHTML() {
    const tweet = this.getReferencedTweet();

    if (!tweet) {
      return '';
    }

    const tweetHtml = TweetTemplate(tweet, 'tweet', { hideControls: true });

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
