const MainTemplate = require('./main.template');
const Tweets = require('./tweets');

class NotificationsMain {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;

    this.container = container;
    this.tweets = null;
  }

  render() {
    if (document.querySelector('.notifications-center')) {
      this.app.browser.replaceElementBySelector(MainTemplate(this), '.notifications-center');
    } else {
      this.app.browser.addElementToSelector(MainTemplate(this), this.container);
    }

    if (this.tweets === null) {
      this.tweets = new Tweets(this.app, this.mod, '.notifications-center');
    }

    this.tweets.render();
  }
}

module.exports = NotificationsMain;
