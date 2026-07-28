const TweetTemplate = require('./tweet.template');

class Tweet {
  constructor(app, mod, container = '.tweets', data = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;

    const tx = data.tx;
    this.tx = tx;
    this.signature = tx && tx.signature != null ? String(tx.signature) : '';

    const raw_msg = tx && tx.msg && typeof tx.msg === 'object' ? tx.msg : {};
    const payload = raw_msg.data && typeof raw_msg.data === 'object' ? raw_msg.data : raw_msg;

    this.username = payload.username != null ? String(payload.username) : '';
    this.time = payload.time != null ? String(payload.time) : '';
    this.text = payload.text != null ? String(payload.text) : '';
    this.parent_id = payload.parent_id != null ? String(payload.parent_id) : '';
    this.thread_id = payload.thread_id != null ? String(payload.thread_id) : '';
    this.num_likes = Number(payload.num_likes) || 0;
    this.num_replies = Number(payload.num_replies) || 0;
    this.link = payload.link != null ? String(payload.link) : '';
    const med = payload.media;
    this.media = Array.isArray(med) ? med : med ? [med] : [];
  }

  render() {
    const sig_sel =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(this.signature)
        : String(this.signature).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const selector = `.tweet[data-id="${sig_sel}"]`;

    if (document.querySelector(selector)) {
      this.app.browser.replaceElementBySelector(TweetTemplate(this), selector);
    } else {
      this.app.browser.addElementToSelector(TweetTemplate(this), this.container);
    }
  }
}

module.exports = Tweet;
