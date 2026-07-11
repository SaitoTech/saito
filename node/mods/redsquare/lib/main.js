const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Composer = require('./composer');
const TweetManager = require('./tweet-manager');
const Profile = require('./profile');
const Sidebar = require('./sidebar');

class Main {
  constructor(app, mod, container = '#saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.menu = new Menu(app, mod, '.sidebar-left');
    this.composer = new Composer(app, mod, '.composer');
    this.tweetManager = new TweetManager(app, mod, '.tweet-manager');
    this.profile = new Profile(app, mod, '.profile');
    this.sidebar = new Sidebar(app, mod, '.sidebar');
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!document.querySelector(this.container)) {
      this.app.browser.addElementToDom(MainTemplate());
    } else {
      this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);
    }

    this.menu.render();
    this.composer.render();
    this.tweetManager.render();
    this.profile.render();
    this.sidebar.render();

    this.attachEvents();
  }

  attachEvents() {
    this.menu.attachEvents();
    this.composer.attachEvents();
    this.tweetManager.attachEvents();
    this.profile.attachEvents();
    this.sidebar.attachEvents();
  }
}

module.exports = Main;
