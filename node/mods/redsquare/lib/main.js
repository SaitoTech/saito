const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Composer = require('./composer');
const Profile = require('./profile');
const NewPost = require('./new-post');
const Sidebar = require('./sidebar');

class Main {
  constructor(app, mod, container = '#saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.composer = new Composer(app, mod);
    this.menu = new Menu(app, mod, '.sidebar-left', this.composer);
    this.manager = mod.manager;
    this.manager.container = '.manager';
    this.profile = new Profile(app, mod, '.sidebar-right > .redsquare-profile');
    this.new_post = new NewPost(app, mod, '.manager .actions');
    this.sidebar = new Sidebar(app, mod, '.sidebar-right > .sidebar');
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
    this.manager.render();
    this.profile.render();
    this.new_post.render();
    this.sidebar.render();

    this.attachEvents();
  }

  attachEvents() {
    this.menu.attachEvents();
    this.manager.attachEvents();
    this.profile.attachEvents();
    this.new_post.attachEvents();
    this.sidebar.attachEvents();
  }
}

module.exports = Main;
