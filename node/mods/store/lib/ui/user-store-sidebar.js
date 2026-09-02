const UserStoreSidebarTemplate = require('./user-store-sidebar.template');
const StoreProfile = require('./store-profile');

/**
 * User-store left rail: Store profile card + Store / Posts nav.
 * Settings is admin-only (not shown on the public storefront).
 */
class UserStoreSidebar {
  constructor(app, mod, container = '', callbacks = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = '';
    this.onSettings = callbacks.onSettings || null;
    this.profile = new StoreProfile(app, mod, '');
  }

  hasPostsRoute() {
    return Boolean(this.app.modules?.returnModule?.('RedSquare'));
  }

  isOwnStore(publicKey = this.publicKey) {
    return Boolean(publicKey && this.mod.publicKey && publicKey === this.mod.publicKey);
  }

  render(container = '', publicKey = '') {
    if (container) {
      this.container = container;
    }

    const key = String(publicKey || this.publicKey || '').trim();
    if (!this.container || !key) {
      return;
    }

    this.publicKey = key;

    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.classList.remove('marketplace', 'dashboard');
    root.classList.add('user-store');
    root.setAttribute('aria-label', 'User store');

    const showPosts = this.hasPostsRoute();
    // Public storefront is visitor-facing — Settings belongs on admin only.
    const showSettings = false;

    this.app.browser.replaceElementContentBySelector(
      UserStoreSidebarTemplate({ showPosts, showSettings }),
      this.container
    );

    this.profile.container = `${this.container} .user-store-profile`;
    this.profile.render('', key);

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('.user-store-rail > .list .item[data-nav]').forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();
        this.activate(item.getAttribute('data-nav') || '');
      };
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activate(item.getAttribute('data-nav') || '');
        }
      };
    });
  }

  activate(nav = '') {
    if (nav === 'store') {
      return;
    }

    if (nav === 'posts') {
      const redsquare = this.app.modules?.returnModule?.('RedSquare');
      if (!redsquare || !this.publicKey) {
        return;
      }
      const path = `/${encodeURI(redsquare.returnSlug())}/user/${encodeURIComponent(this.publicKey)}`;
      if (typeof navigateWindow === 'function') {
        navigateWindow(path);
      } else {
        window.location.assign(path);
      }
      return;
    }

    if (nav === 'settings' && this.isOwnStore()) {
      if (typeof this.onSettings === 'function') {
        this.onSettings();
      }
    }
  }
}

module.exports = UserStoreSidebar;
