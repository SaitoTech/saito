const UserStoreNavTemplate = require('./user-store-sidebar.template');
const SaitoProfile = require('../../../../lib/saito/ui/saito-profile/saito-profile');

/**
 * User-store profile context: shared SaitoProfile (read-only) with Store nav
 * injected into the profile card footer slot, plus Store-owned attribution
 * below the card (outside SaitoProfile).
 */
class UserStoreSidebar {
  constructor(app, mod, container = '', callbacks = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = '';
    this.onSettings = callbacks.onSettings || null;
    this.profile = new SaitoProfile(app, mod, '');
    // Public storefront is always read-only (no camera / pencil). Shared component stays editable for other hosts.
    this.profile.editable = false;
  }

  hasPostsRoute() {
    return Boolean(this.app.modules?.returnModule?.('RedSquare'));
  }

  isOwnStore(publicKey = this.publicKey) {
    return Boolean(publicKey && this.mod.publicKey && publicKey === this.mod.publicKey);
  }

  /** Canonical marketplace path — same slug routing as Store header / setBrowseUrl. */
  marketplacePath() {
    return `/${encodeURI(this.mod.returnSlug?.() || 'store')}`;
  }

  openMarketplace(e) {
    if (e) {
      e.preventDefault();
    }
    const path = this.marketplacePath();
    if (typeof navigateWindow === 'function') {
      navigateWindow(path);
    } else {
      window.location.assign(path);
    }
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

    const showPosts = this.hasPostsRoute();
    const showSettings = this.isOwnStore(key);
    const marketPath = this.marketplacePath();

    root.innerHTML = `
      <div class="user-store-profile"></div>
      <p class="user-store-attribution">
        Listings indexed on the
        <a href="${marketPath}" data-store-attribution="marketplace">Saito Store</a>
      </p>
    `;

    this.profile.editable = false;
    this.profile.container = `${this.container} .user-store-profile`;
    this.profile.reset(key);
    this.profile.editable = false;
    this.profile.render();

    const footer = this.profile.getFooterEl();
    if (footer) {
      footer.innerHTML = UserStoreNavTemplate({ showPosts, showSettings });
    }

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-store-attribution="marketplace"]').forEach((link) => {
      link.onclick = (e) => this.openMarketplace(e);
    });

    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }

    footer.querySelectorAll('.user-store-nav .item[data-nav]').forEach((item) => {
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
