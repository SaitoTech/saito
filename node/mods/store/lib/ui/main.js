const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Manager = require('./manager');
const UserStoreSidebar = require('./user-store-sidebar');
const NftPickerOverlay = require('./overlays/nft-picker');
const PrepareStoreOverlay = require('./overlays/prepare-store');
const ListingDetailOverlay = require('./overlays/listing-detail');
const RentalListingOverlay = require('./overlays/rental-listing');
const PurchaseOverlay = require('./overlays/purchase');
const SettingsOverlay = require('./overlays/settings');
const PurchaseLifecycle = require('./purchase-lifecycle');
const ListingLifecycle = require('./listing-lifecycle');
const { normalizeListingMode } = require('../categories');

class Main {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    /** @type {'marketplace' | 'user-store' | 'admin'} */
    this.composition = 'marketplace';

    if (!this.mod.purchase_lifecycle) {
      this.mod.purchase_lifecycle = new PurchaseLifecycle(app, mod);
    }
    if (!this.mod.listing_lifecycle) {
      this.mod.listing_lifecycle = new ListingLifecycle(app, mod);
    }

    this.menu = new Menu(app, mod, '', {
      onNavigate: (view, opts) => this.onNavigate(view, opts),
      onSell: () => this.openSell(),
      onSettings: () => this.openSettings(),
      onStoreModeChange: (mode) => this.onStoreModeChange(mode)
    });
    this.user_store_sidebar = new UserStoreSidebar(app, mod, '', {
      onSettings: () => this.openSettings()
    });
    this.manager = new Manager(app, mod, '', {
      onSell: () => this.openSell(),
      onStoreModeChange: (mode) => this.onStoreModeChange(mode)
    });
    this.nft_picker = null;
    this.prepare_store = null;
    this.listing_detail = null;
    this.purchase_overlay = null;
    this.settings_overlay = null;

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

  railSelector() {
    return `${this.container} .store > .menu`;
  }

  storeRoot() {
    return document.querySelector(`${this.container} .store`);
  }

  /**
   * Shell composition: marketplace categories, user-store profile rail, or admin dashboard.
   * Only swaps the left rail + .store.user-store geometry — not listing machinery.
   */
  setComposition(mode = 'marketplace', publicKey = '') {
    const next = mode === 'user-store' ? 'user-store' : mode === 'admin' ? 'admin' : 'marketplace';
    this.composition = next;

    const store = this.storeRoot();
    if (store) {
      store.classList.toggle('user-store', next === 'user-store');
    }

    const rail = this.railSelector();
    if (next === 'user-store') {
      // Prevent Menu.refreshHasStore from rewriting this rail as categories.
      this.menu.mode = 'user-store';
      this.user_store_sidebar.render(rail, publicKey);
      return;
    }

    const menuRoot = document.querySelector(rail);
    if (menuRoot) {
      menuRoot.classList.remove('user-store');
    }

    if (next === 'admin') {
      this.menu.setMode('dashboard', {
        dashboardView: this.menu.dashboardView || 'store-admin'
      });
      return;
    }

    this.menu.setMode('browse');
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
    this.setComposition('marketplace');
    this.menu.setActive('all');
    this.manager.show('browse');
    this.loadBrowsePage({ category: '', page: 1 });
  }

  async initialize() {
    this.nft_picker = new NftPickerOverlay(this.app, this.mod);
    this.prepare_store = new PrepareStoreOverlay(this.app, this.mod);
    this.listing_detail = new ListingDetailOverlay(this.app, this.mod);
    this.rental_listing = new RentalListingOverlay(this.app, this.mod);
    this.purchase_overlay = new PurchaseOverlay(this.app, this.mod);
    this.settings_overlay = new SettingsOverlay(this.app, this.mod);

    this.prepare_store.onContinue = (defaults) => {
      this.nft_picker.render(defaults || {});
    };
    this.prepare_store.onCreateNft = (defaults) => {
      this.nft_picker.defaults = defaults || {};
      this.nft_picker.openCreateNft();
    };
    this.nft_picker.onSelect = (nft, defaults) => {
      if (normalizeListingMode(defaults?.listing_mode) === 'rent') {
        this.rental_listing.render({ source_nft: nft, defaults });
        return;
      }
      this.listing_detail.render({ mode: 'edit', nft, defaults });
    };
    this.listing_detail.onBack = (defaults) => {
      this.nft_picker.render(defaults || {});
    };
    this.rental_listing.onBack = (defaults) => {
      this.nft_picker.render({ ...(defaults || {}), listing_mode: 'rent' });
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
  }

  onNavigate(view = '', opts = {}) {
    if (view === 'my-store' || view === 'store-admin') {
      this.openStorefront(this.mod.publicKey, { admin: true });
      return;
    }

    if (view === 'view-store') {
      this.openStorefront(this.mod.publicKey, { admin: false });
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
      this.setComposition('marketplace');
      this.menu.setActive('all');
      this.manager.show('browse');
      this.setBrowseUrl();
      this.loadBrowsePage({ category: '', page: 1, scroll: true });
      return;
    }

    // Category browse (data-category from menu items).
    if (Object.prototype.hasOwnProperty.call(opts, 'category')) {
      this.setComposition('marketplace');
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
        this.menu.dashboardView = view;
        this.setComposition('admin');
        if (celebrate) {
          this.manager.storefront.armSuccessBanner();
        }
        await this.manager.showStorefront(key, {
          viewMode: 'admin',
          adminSection: view === 'active' ? 'active' : 'home'
        });
      } else {
        this.setComposition('marketplace');
        await this.manager.showStorefront(key, { viewMode: 'admin-denied' });
      }

      if (updateUrl) {
        this.setAdminUrl(key);
      }
      return;
    }

    this.setComposition('user-store', key);
    await this.manager.showStorefront(key, { viewMode: 'public' });

    if (updateUrl) {
      this.setStorefrontUrl(key);
    }
  }

  openSales() {
    this.menu.dashboardView = 'sold';
    this.setComposition('admin');
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

  /**
   * True when this wallet already has a storefront (menu cache, Profile URL, or listings).
   */
  hasOwnStore() {
    if (this.menu?.has_store) {
      return true;
    }
    if (this.mod.returnProfileStoreUrl?.()) {
      return true;
    }
    const storefront = this.manager?.storefront;
    return !!(
      storefront?.inventoryLoaded &&
      storefront.publicKey === this.mod.publicKey &&
      storefront.activeSummaries?.length > 0
    );
  }

  openSell(defaults = {}) {
    const next = {
      ...defaults,
      listing_mode: normalizeListingMode(defaults.listing_mode)
    };
    if (next?.nft) {
      if (next.listing_mode === 'rent') {
        this.rental_listing.render({ source_nft: next.nft, defaults: next });
        return;
      }
      this.listing_detail.render({ mode: 'edit', nft: next.nft, defaults: next });
      return;
    }

    if (this.prepare_store && !this.hasOwnStore()) {
      this.prepare_store.render(next);
      return;
    }

    this.nft_picker.render(next);
  }

  openSettings() {
    this.settings_overlay?.render();
  }
}

module.exports = Main;
