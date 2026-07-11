const TweetManagerTemplate = require('./tweet-manager.template');

class TweetManager {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.tweets = [];
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.tweets = this.mod.tweets;

    this.app.browser.replaceElementContentBySelector(
      TweetManagerTemplate(this),
      this.container
    );

    for (let tweet of this.tweets) {
      tweet.render(`${this.container} .tweets`);
    }

    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = TweetManager;
