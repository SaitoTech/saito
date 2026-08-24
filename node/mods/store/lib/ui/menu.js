const MenuTemplate = require('./menu.template');

class Menu {
  constructor(app, mod, container = '', callbacks = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.onNavigate = callbacks.onNavigate || null;
    this.onSell = callbacks.onSell || null;
    this.onSettings = callbacks.onSettings || null;
    this.onStoreModeChange = callbacks.onStoreModeChange || null;
    this.active = 'all';
    this.mode = 'browse';
    this.dashboardView = 'store-admin';
    this.has_store = false;
    this.store_check_done = false;
    this._checking_store = false;

    this.app.connection.on('store-listing-lifecycle', (entry) => {
      if (entry?.phase === 'complete' && !this.has_store) {
        this.has_store = true;
        this.renderBrowseIfVisible();
      }
    });
    this.app.connection.on('store-profile-link-updated', () => {
      if (!this.has_store) {
        this.has_store = true;
        this.renderBrowseIfVisible();
      }
    });
    this.app.connection.on('store-render-listings', () => {
      if (!this.has_store && !this.store_check_done) {
        void this.refreshHasStore();
      }
    });
  }

  renderBrowseIfVisible() {
    if (this.mode === 'browse' && this.container) {
      this.render();
    }
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!this.container) {
      return;
    }

    if (!this.has_store && this.mod.publicKey && this.mod.returnProfileStoreUrl?.()) {
      this.has_store = true;
    }

    const root = document.querySelector(this.container);
    if (root) {
      root.classList.toggle('marketplace', this.mode === 'browse');
      root.classList.toggle('dashboard', this.mode === 'dashboard');
    }

    const html =
      this.mode === 'dashboard'
        ? MenuTemplate.dashboard({ dashboardView: this.dashboardView })
        : MenuTemplate.browse({ showMyStore: this.has_store });

    this.app.browser.replaceElementContentBySelector(html, this.container);

    if (this.mode === 'browse') {
      this.setActive(this.active);
      if (!this.has_store) {
        void this.refreshHasStore();
      }
    }

    this.attachEvents();
  }

  /**
   * Show "My Saito Store" when the user already has a storefront (Profile URL
   * or at least one listing). Reuses returnProfileStoreUrl + loadListingsPage.
   */
  async refreshHasStore() {
    if (this.has_store || this._checking_store || this.store_check_done) {
      return;
    }
    if (!this.mod.publicKey) {
      this.store_check_done = true;
      return;
    }
    if (this.mod.returnProfileStoreUrl?.()) {
      this.has_store = true;
      this.renderBrowseIfVisible();
      return;
    }

    const storefront = this.mod.main?.manager?.storefront;
    if (
      storefront?.inventoryLoaded &&
      storefront.publicKey === this.mod.publicKey &&
      storefront.activeSummaries?.length > 0
    ) {
      this.has_store = true;
      this.renderBrowseIfVisible();
      return;
    }

    if (!this.mod.store_public_key) {
      return;
    }

    this._checking_store = true;
    try {
      const { loadListingsPage } = require('./browse-listings');
      const result = await loadListingsPage(this.app, this.mod, {
        public_key: this.mod.publicKey,
        category: '',
        offset: 0,
        page_size: 1
      });
      const total = Number(result?.pagination?.total ?? result?.listings?.length ?? 0);
      this.store_check_done = true;
      if (total > 0) {
        this.has_store = true;
        this.renderBrowseIfVisible();
      }
    } catch (err) {
      // Peer not ready — retry on store-render-listings.
    } finally {
      this._checking_store = false;
    }
  }

  setMode(mode = 'browse', { dashboardView = this.dashboardView, storeMode } = {}) {
    this.mode = mode === 'dashboard' ? 'dashboard' : 'browse';
    if (storeMode === 'sold') {
      this.dashboardView = 'sold';
    } else if (storeMode === 'active') {
      this.dashboardView = dashboardView === 'active' ? 'active' : 'store-admin';
    } else if (dashboardView) {
      this.dashboardView = ['store-admin', 'active', 'sold'].includes(dashboardView)
        ? dashboardView
        : 'store-admin';
    }
    this.render();
  }

  setDashboardView(dashboardView = 'store-admin') {
    this.dashboardView = ['store-admin', 'active', 'sold'].includes(dashboardView)
      ? dashboardView
      : 'store-admin';
    if (this.mode !== 'dashboard' || !this.container) {
      return;
    }
    this.setActive(this.dashboardView);
  }

  /** @deprecated Prefer setDashboardView — kept for callers that still pass storeMode. */
  setStoreMode(storeMode = 'active') {
    this.setDashboardView(storeMode === 'sold' ? 'sold' : 'store-admin');
  }

  setActive(view = '') {
    if (this.mode === 'dashboard') {
      this.dashboardView = ['store-admin', 'active', 'sold'].includes(view)
        ? view
        : this.dashboardView;
    } else {
      this.active = view;
    }
    if (!this.container) {
      return;
    }
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    const current = this.mode === 'dashboard' ? this.dashboardView : this.active;
    root.querySelectorAll('.item').forEach((item) => {
      if (item.dataset.action) {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
        return;
      }
      const on = item.dataset.view === current;
      item.classList.toggle('active', on);
      item.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }

  activate(item) {
    if (item.dataset.action === 'list-item') {
      if (typeof this.onSell === 'function') {
        this.onSell();
      }
      return;
    }

    if (item.dataset.action === 'settings') {
      if (typeof this.onSettings === 'function') {
        this.onSettings();
      }
      return;
    }

    const view = item.dataset.view || '';
    const category = item.dataset.category != null ? item.dataset.category : undefined;
    this.setActive(view);
    if (typeof this.onNavigate === 'function') {
      this.onNavigate(view, { category });
    }
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('.item').forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();
        this.activate(item);
      };
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activate(item);
        }
      };
    });
  }
}

module.exports = Menu;
