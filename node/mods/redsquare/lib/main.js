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
    this.active_mobile_view = 'feed';
    this.chat_manager = null;
  }

  setChatManager(chatManager = null) {
    this.chat_manager = chatManager;
    this.syncChatManagerContainer();
  }

  hasChatCapability() {
    return Boolean(this.chat_manager && typeof this.chat_manager.render === 'function');
  }

  isCompactViewport() {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 600px)').matches
    );
  }

  syncChatManagerContainer() {
    if (!this.hasChatCapability()) {
      return;
    }

    const compact = this.isCompactViewport();

    this.chat_manager.container = compact ? '.redsquare-mobile-chat' : '.sidebar-left';
    this.chat_manager.chat_popup_container = compact ? '.redsquare-mobile-chat' : '';
    this.chat_manager.render_manager_to_screen = 1;
  }

  showMobileView(view = 'feed') {
    if (!this.isCompactViewport()) {
      return false;
    }

    if (view === 'chat' && !this.hasChatCapability()) {
      view = 'feed';
    }

    document.querySelectorAll('.main > [data-mobile-view]').forEach((panel) => {
      panel.hidden = panel.dataset.mobileView !== view;
    });

    this.active_mobile_view = view;
    document.body.dataset.redsquareMobileView = view;

    if (view === 'settings') {
      this.renderMobileSettings();
    }

    if (view === 'chat') {
      this.syncChatManagerContainer();
      this.chat_manager.render();
    }

    return true;
  }

  renderMobileSettings() {
    const container = '.redsquare-mobile-settings';
    const host = document.querySelector(container);

    if (!host || host.querySelector('#redsquare-settings-overlay')) {
      return;
    }

    this.mod.settings_overlay?.renderInto(container);
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

    this.syncChatManagerContainer();

    this.menu.render();
    this.manager.render();
    this.profile.render();
    this.new_post.render();
    this.sidebar.render();

    if (this.isCompactViewport()) {
      this.showMobileView(this.active_mobile_view);
    }

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
