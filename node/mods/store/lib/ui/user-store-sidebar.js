const UserStoreNavTemplate = require('./user-store-sidebar.template');
const SaitoProfile = require('../../../../lib/saito/ui/saito-profile/saito-profile');

/**
 * User-store profile context: shared SaitoProfile (read-only) with Store nav
 * injected into the profile card footer slot.
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
    this.categories = [];
    this.activeCategory = '';
    this.featured = true;
    this.featuredName = 'Featured Items';
    this.featuredVisible = true;
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
    if (!this.isOwnStore(publicKey)) {
      return [];
    }
    return [
      {
        action: 'admin-store',
        label: 'Manage Store',
        icon: 'fa-solid fa-gear'
      }
    ];
  }

  /** Canonical marketplace path — same slug routing as Store header / setBrowseUrl. */
  marketplacePath() {
    return `/${encodeURI(this.mod.returnSlug?.() || 'store')}`;
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
    this.renderProfileMenu();
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

    root.innerHTML = `
      <div class="user-store-profile"></div>
    `;

    this.profile.editable = false;
    this.profile.container = `${this.container} .user-store-profile`;
    this.profile.reset(key);
    this.profile.editable = false;
    this.profile.render();

    this.renderNav();
    this.renderCategories();
    this.attachEvents();
  }

  setCategories(
    categories = [],
    { category = '', featured = false, featuredName = '', featuredVisible = true } = {}
  ) {
    const label = String(featuredName || '').trim();
    if (label) {
      this.featuredName = label;
    }
    this.featuredVisible = featuredVisible !== false && featuredVisible !== 0;
    this.categories = Array.isArray(categories) ? categories : [];
    this.activeCategory = String(category || '');
    this.featured = !!featured && !this.activeCategory;
    this.renderCategories();
  }

  parentId(category) {
    return String(category?.parent_id || category?.parent_category_id || '').trim();
  }

  visibleCategories(categories = []) {
    return (Array.isArray(categories) ? categories : []).filter((category) => {
      const count = category?.listing_count ?? category?.count;
      if (count == null || count === '') {
        return true;
      }
      const total = Number(count);
      return !Number.isFinite(total) || total > 0;
    });
  }

  categoryForest(categories = []) {
    const nodes = this.visibleCategories(categories).map((category) => ({
      category,
      children: []
    }));
    const byId = new Map(
      nodes.map((node) => [String(node.category.category_id || ''), node])
    );
    const roots = [];
    nodes.forEach((node) => {
      const parent = byId.get(this.parentId(node.category));
      if (parent && parent !== node) {
        parent.children.push(node);
        return;
      }
      roots.push(node);
    });
    return roots;
  }

  categoryRows(nodes = [], depth = 0) {
    return nodes
      .map((node) => {
        const id = String(node.category.category_id || '');
        const name = String(node.category.name || id);
        const active = !this.featured && id && id === this.activeCategory ? ' active' : '';
        const row = `<div class="item${active}" role="button" tabindex="0" data-store-category="${this.escape(id)}">${this.escape(name)}</div>`;
        return row + this.categoryRows(node.children, depth + 1);
      })
      .join('');
  }

  renderProfileMenu() {
    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }
    const featuredClass = this.featured ? ' active' : '';
    const manage = UserStoreNavTemplate(this.returnNavItems(this.publicKey));
    const categories = this.categoryRows(this.categoryForest(this.categories));
    const featuredItem = this.featuredVisible
      ? `<div class="item${featuredClass}" role="button" tabindex="0" data-store-category="">${this.escape(this.featuredName || 'Featured Items')}</div>`
      : '';
    footer.innerHTML = `
      <nav class="user-store-nav saito-menu-select-subtle" aria-label="Seller store">
        ${featuredItem}
        ${categories}
        ${manage ? `<div class="divider" role="separator"></div>${manage}` : ''}
      </nav>
    `;
    this.attachNavEvents();
    this.attachCategoryEvents(footer);
  }

  renderCategories() {
    this.renderProfileMenu();
  }

  attachCategoryEvents(footer) {
    footer.querySelectorAll('[data-store-category]').forEach((item) => {
      const open = (e) => {
        e.preventDefault();
        const category = item.getAttribute('data-store-category') || '';
        this.mod.main?.openStorefront?.(this.publicKey, {
          category,
          featured: !category,
          admin: false
        });
      };
      item.onclick = open;
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          open(e);
        }
      };
    });
  }

  escape(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

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
      return;
    }
    if (action === 'share-store') {
      const url = this.mod.returnStorefrontUrl?.(this.publicKey) || '';
      if (!url) {
        return;
      }
      const copy = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(url)
        : Promise.reject(new Error('clipboard unavailable'));
      copy
        .then(() => {
          if (typeof siteMessage === 'function') {
            siteMessage('Store link copied', 1500);
          }
        })
        .catch((err) => {
          console.warn('Store: copy storefront URL failed', err?.message || err);
        });
    }
  }
}

module.exports = UserStoreSidebar;
