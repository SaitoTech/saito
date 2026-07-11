const TweetTemplate = require('./tweet.template');

class Tweet {
  constructor(app, mod, tx = null) {
    this.app = app;
    this.mod = mod;
    this.container = '';
    this.tx = tx;

    this.text = '';
    this.images = [];
    this.parent_id = '';
    this.thread_id = '';
    this.user = {
      name: 'Anonymous',
      handle: 'anon',
      avatar: '/saito/img/dreamscape.png'
    };
    this.time = '';
    this.timestamp = Date.now();
    this.likes = 0;
    this.replies = 0;
    this.retweets = 0;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.addElementToSelector(TweetTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Tweet;
