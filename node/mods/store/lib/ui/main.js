const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Manager = require('./manager');
const NftPickerOverlay = require('./overlays/nft-picker');
const ListingDetailOverlay = require('./overlays/listing-detail');
const PurchaseOverlay = require('./overlays/purchase');
const PurchaseLifecycle = require('./purchase-lifecycle');
const PurchaseStatus = require('./purchase-status');
const ListingLifecycle = require('./listing-lifecycle');

class Main {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    if (!this.mod.purchase_lifecycle) {
      this.mod.purchase_lifecycle = new PurchaseLifecycle(app, mod);
    }
    if (!this.mod.listing_lifecycle) {
      this.mod.listing_lifecycle = new ListingLifecycle(app, mod);
    }

    this.menu = new Menu(app, mod, '', {
      onNavigate: (view, opts) => this.onNavigate(view, opts),
      onSell: () => this.openSell(),
      onStoreModeChange: (mode) => this.onStoreModeChange(mode)
    });
    this.manager = new Manager(app, mod, '', {
      onSell: () => this.openSell(),
      onStoreModeChange: (mode) => this.onStoreModeChange(mode)
    });
    this.purchase_status = new PurchaseStatus(app, mod, '', {
      onShowProgress: () => this.reopenPurchaseProgress(),
      onViewNfts: () => this.openMyNfts()
    });
    this.nft_picker = null;
    this.listing_detail = null;
    this.purchase_overlay = null;

    // Compatibility aliases for existing callers (store.respondTo, teaser, detail buy).
    this.product_overlay = null;
    this.listing_overlay = null;
    this.purchase_flow = null;

    this.app.connection.on('store-render-listings', () => {
      this.manager.reloadBrowsePage();
    });

    if (this.app.BROWSER && typeof window !== 'undefined') {
      window.addEventListener('popstate', () => this.onPathChange());
    }
  }

  onPathChange() {
    const route = this.mod.returnStoreRouteFromPath?.() || {
      publicKey: '',
      admin: false
    };
    if (route.publicKey) {
      this.openStorefront(route.publicKey, {
        updateUrl: false,
        admin: !!route.admin
      });
      return;
    }
    this.menu.setMode('browse');
    this.menu.setActive('all');
    this.manager.show('browse');
    this.loadBrowsePage({ category: '', page: 1 });
  }

  async initialize() {
    this.nft_picker = new NftPickerOverlay(this.app, this.mod);
    this.listing_detail = new ListingDetailOverlay(this.app, this.mod);
    this.purchase_overlay = new PurchaseOverlay(this.app, this.mod);

    this.nft_picker.onSelect = (nft, defaults) => {
      this.listing_detail.render({ mode: 'edit', nft, defaults });
    };
    this.listing_detail.onBack = (defaults) => {
      this.nft_picker.render(defaults || {});
    };

    this.product_overlay = this.listing_detail;
    this.purchase_flow = this.purchase_overlay;
    this.listing_overlay = {
      render: (defaults = {}) => this.openSell(defaults)
    };
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    const root = document.querySelector(this.container);
    if (root) {
      root.classList.add('store-container');
    }

    this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);

    this.menu.render(`${this.container} .store > .menu`);
    this.manager.render(`${this.container} .store > .main-column > .manager`);
    this.purchase_status.render(`${this.container} .store > .main-column > .purchase-status-slot`);
  }

  onNavigate(view = '', opts = {}) {
    if (view === 'my-store' || view === 'store-admin') {
      this.openStorefront(this.mod.publicKey, { admin: true });
      return;
    }

    if (view === 'active') {
      this.openStorefront(this.mod.publicKey, {
        updateUrl: true,
        celebrate: false,
        admin: true,
        dashboardView: 'active'
      });
      return;
    }

    if (view === 'sold') {
      this.openSales();
      return;
    }

    if (view === 'all') {
      this.menu.setMode('browse');
      this.manager.show('browse');
      this.setBrowseUrl();
      this.loadBrowsePage({ category: '', page: 1, scroll: true });
      return;
    }

    // Category browse (data-category from menu items).
    if (Object.prototype.hasOwnProperty.call(opts, 'category')) {
      this.menu.setMode('browse');
      this.manager.show('browse');
      this.setBrowseUrl();
      this.loadBrowsePage({
        category: String(opts.category || ''),
        page: 1,
        scroll: true
      });
    }
  }

  loadBrowsePage({ category = '', page = 1, scroll = false } = {}) {
    return this.manager.loadBrowsePage({ category, page, scroll });
  }

  /**
   * Open a creator storefront or seller admin page.
   * Public /store/<pk> always shows the public storefront (even for the owner).
   * Admin /store/<pk>/admin requires the logged-in wallet to match <pk>.
   */
  async openStorefront(
    publicKey = '',
    { updateUrl = true, celebrate = false, dashboardView = 'store-admin', admin = false } = {}
  ) {
    const key = String(publicKey || this.mod.publicKey || '').trim();
    if (!key) {
      return;
    }

    const isOwn = !!this.mod.publicKey && key === this.mod.publicKey;

    if (admin) {
      if (isOwn) {
        const view = celebrate
          ? 'store-admin'
          : ['store-admin', 'active'].includes(dashboardView)
            ? dashboardView
            : 'store-admin';
        this.menu.setMode('dashboard', { dashboardView: view });
        if (celebrate) {
          this.manager.storefront.armSuccessBanner();
        }
        await this.manager.showStorefront(key, {
          viewMode: 'admin',
          adminSection: view === 'active' ? 'active' : 'home'
        });
      } else {
        if (this.menu.mode === 'dashboard') {
          this.menu.setMode('browse');
        }
        await this.manager.showStorefront(key, { viewMode: 'admin-denied' });
      }

      if (updateUrl) {
        this.setAdminUrl(key);
      }
      return;
    }

    if (this.menu.mode === 'dashboard') {
      this.menu.setMode('browse');
    }

    await this.manager.showStorefront(key, { viewMode: 'public' });

    if (updateUrl) {
      this.setStorefrontUrl(key);
    }
  }

  openSales() {
    this.menu.setMode('dashboard', { dashboardView: 'sold' });
    this.manager.showSales();
    if (this.mod.publicKey) {
      this.setAdminUrl(this.mod.publicKey);
    }
  }

  onStoreModeChange(mode = 'active') {
    if (mode === 'sold') {
      this.openSales();
      return;
    }
    this.openStorefront(this.mod.publicKey, {
      updateUrl: true,
      celebrate: false,
      admin: true,
      dashboardView: 'active'
    });
  }

  setBrowseUrl() {
    if (!this.app.BROWSER || typeof history === 'undefined') {
      return;
    }
    const path = '/' + (this.mod.returnSlug?.() || 'store');
    if (window.location.pathname !== path) {
      history.pushState({ store: 'browse' }, '', path);
    }
  }

  setStorefrontUrl(publicKey = '') {
    if (!this.app.BROWSER || typeof history === 'undefined' || !publicKey) {
      return;
    }
    const path = this.mod.returnStorefrontPath?.(publicKey);
    if (path && window.location.pathname !== path) {
      history.pushState({ store: 'storefront', publicKey }, '', path);
    }
  }

  setAdminUrl(publicKey = '') {
    if (!this.app.BROWSER || typeof history === 'undefined' || !publicKey) {
      return;
    }
    const path = this.mod.returnAdminPath?.(publicKey);
    if (path && window.location.pathname !== path) {
      history.pushState({ store: 'admin', publicKey }, '', path);
    }
  }

  reopenPurchaseProgress() {
    const purchase = this.mod.purchase_lifecycle?.returnActivePurchase?.();
    const overlay = this.purchase_overlay;
    if (!purchase || !overlay) {
      return;
    }

    overlay.listingTitle = purchase.title || '';
    overlay.pendingTxSignature = purchase.purchase_tx_signature || '';
    overlay.nft_id = purchase.nft_id || '';
    overlay.quantity = purchase.quantity || 1;

    if (purchase.phase === PurchaseLifecycle.PHASE.COMPLETE) {
      overlay.openComplete();
      return;
    }
    if (purchase.phase === PurchaseLifecycle.PHASE.FULFILLING) {
      overlay.openFulfilling();
      return;
    }
    overlay.openWaiting(purchase.title, purchase.purchase_tx_signature, {
      nft_id: purchase.nft_id,
      quantity: purchase.quantity
    });
  }

  openMyNfts() {
    const active = this.mod.purchase_lifecycle?.returnActivePurchase?.();
    if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
      this.mod.purchase_lifecycle.dismiss(active.id);
    }
    this.purchase_overlay?.hide?.();
    this.app.connection.emit('saito-nft-list-render-request');
  }

  openSell(defaults = {}) {
    if (defaults?.nft) {
      this.listing_detail.render({ mode: 'edit', nft: defaults.nft, defaults });
      return;
    }

    this.nft_picker.render(defaults);
  }
}

module.exports = Main;
