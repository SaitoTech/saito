const UserStoreNavTemplate = require('./user-store-sidebar.template');
const SaitoProfile = require('../../../../lib/saito/ui/saito-profile/saito-profile');

/**
 * User-store profile context: shared SaitoProfile (read-only) with Store nav
 * injected into the profile card footer slot, plus Store-owned attribution
 * below the card (outside SaitoProfile).
 *
 * Footer follows the Red Square pattern: host owns the slot; Chat is opened
 * via connection events (no hard Chat module API).
 */
class UserStoreSidebar {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = '';
    this.profile = new SaitoProfile(app, mod, '');
    // Public storefront is always read-only (no camera / pencil).
    this.profile.editable = false;
  }

  hasChat() {
    return Boolean(this.app.modules?.returnModuleBySlug?.('chat'));
  }

  isOwnStore(publicKey = this.publicKey) {
    return Boolean(publicKey && this.mod.publicKey && publicKey === this.mod.publicKey);
  }

  /**
   * @returns {Array<{ action: string, label: string, icon: string }>}
   */
  returnNavItems(publicKey = this.publicKey) {
    const items = [];
    const key = String(publicKey || '').trim();
    if (key && this.hasChat() && !this.isOwnStore(key)) {
      items.push({
        action: 'send-message',
        label: 'Send Message',
        icon: 'fa-solid fa-lock'
      });
    }
    if (this.isOwnStore(publicKey)) {
      items.push({
        action: 'admin-store',
        label: 'Admin Store',
        icon: 'fa-solid fa-gear'
      });
    }
    return items;
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

  openAdminStore(publicKey = this.publicKey) {
    const key = String(publicKey || '').trim();
    if (!key || !this.isOwnStore(key)) {
      return;
    }
    if (typeof this.mod.main?.openStorefront === 'function') {
      void this.mod.main.openStorefront(key, { admin: true });
      return;
    }
    const path = this.mod.returnAdminPath?.(key) || `${this.marketplacePath()}/${encodeURIComponent(key)}/admin`;
    if (typeof navigateWindow === 'function') {
      navigateWindow(path);
    } else {
      window.location.assign(path);
    }
  }

  openChat(publicKey = this.publicKey) {
    const key = String(publicKey || '').trim();
    if (!key || !this.hasChat()) {
      return;
    }
    // ChatManager owns the open-chat-with listener; create it if needed
    // (same side-effect Chat's user-menu uses before emitting).
    this.app.modules.returnFirstRespondTo('chat-manager');
    this.app.connection.emit('open-chat-with', {
      key,
      activate: true
    });
  }

  renderNav() {
    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }

    footer.innerHTML = UserStoreNavTemplate(this.returnNavItems(this.publicKey));
    this.attachNavEvents();
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

    this.renderNav();
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

    this.attachNavEvents();
  }

  attachNavEvents() {
    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }

    footer.querySelectorAll('.user-store-nav .item[data-nav-action]').forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();
        this.activateNav(item.getAttribute('data-nav-action') || '');
      };
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activateNav(item.getAttribute('data-nav-action') || '');
        }
      };
    });
  }

  activateNav(action = '') {
    if (action === 'admin-store') {
      this.openAdminStore(this.publicKey);
      return;
    }
    if (action === 'send-message') {
      this.openChat(this.publicKey);
    }
  }
}

module.exports = UserStoreSidebar;
