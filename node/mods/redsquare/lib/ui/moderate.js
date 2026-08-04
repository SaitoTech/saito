const Tweet = require('../tweet');
const ModerateTemplate = require('./moderate.template');

class Moderate {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.txs = [];
    this.tweets = [];
    this.container = '';
  }

  setTransactions(txs = []) {
    this.txs = Array.isArray(txs) ? txs.filter(Boolean) : [];
    this.tweets = [];

    for (const tx of this.txs) {
      const tweet = new Tweet(this.app, this.mod, tx);

      if (tweet.signature) {
        // Review items stay private to this component — never enter the timeline.
        // Clear display mask so moderators can read the reported content.
        tweet.flagged = 0;
        this.tweets.push(tweet);
      }
    }
  }

  count() {
    return this.tweets.length;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!this.container || !this.app.BROWSER) {
      return;
    }

    const panel = document.querySelector(this.container);

    if (!panel) {
      return;
    }

    panel.querySelectorAll(':scope > .moderate').forEach((node) => node.remove());

    const html = ModerateTemplate(this);

    if (!html) {
      return;
    }

    panel.insertAdjacentHTML('afterbegin', html);
    this.attachEvents();
  }

  /**
   * Keep the review block above notification rows after prepends.
   */
  ensureTop() {
    if (!this.container || !this.app.BROWSER) {
      return;
    }

    const panel = document.querySelector(this.container);

    if (!panel) {
      return;
    }

    const moderate = panel.querySelector(':scope > .moderate');

    if (moderate && panel.firstElementChild !== moderate) {
      panel.prepend(moderate);
    }
  }

  attachEvents() {
    if (!this.container) {
      return;
    }

    const root = document.querySelector(`${this.container} > .moderate`);

    if (!root) {
      return;
    }

    root.querySelectorAll('[data-action]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const action = button.getAttribute('data-action');
        const signature = button.getAttribute('data-id');
        const tweet = this.tweets.find((item) => item.signature === signature);

        if (!tweet) {
          return;
        }

        if (action === 'approve') {
          this.handleApprove(tweet);
          return;
        }

        if (action === 'delete') {
          this.handleDelete(tweet);
          return;
        }

        if (action === 'ban') {
          this.handleBan(tweet);
        }
      };
    });
  }

  async handleApprove(tweet) {
    await this.submitReview(tweet, 'approve');
  }

  async handleDelete(tweet) {
    await this.submitReview(tweet, 'delete');
  }

  async handleBan(tweet) {
    const publicKey = tweet?.publicKey || '';

    await this.submitReview(tweet, 'delete');

    if (publicKey && publicKey !== this.mod.publicKey) {
      this.app.connection.emit('saito-blacklist', { publicKey });
    }
  }

  async submitReview(tweet, decision) {
    if (!tweet?.signature || (decision !== 'approve' && decision !== 'delete')) {
      return;
    }

    try {
      const tx = await this.mod.createReviewTweetTransaction({
        signature: tweet.signature,
        decision
      });
      await tx.sign();
      await this.app.network.propagateTransaction(tx);
      await this.mod.receiveReviewTweetTransaction(tx);
    } catch (err) {
      console.error('RedSquare review failed:', err);
      siteMessage('Unable to submit review', 2500);
    }
  }

  removeTweet(signature) {
    const before = this.tweets.length;

    this.tweets = this.tweets.filter((tweet) => tweet.signature !== signature);
    this.txs = this.txs.filter((tx) => String(tx?.signature || '') !== String(signature));

    if (this.tweets.length === before) {
      return;
    }

    this.render();
    this.mod.updateNotificationBadge?.();
  }
}

module.exports = Moderate;
