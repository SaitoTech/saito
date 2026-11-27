const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Manager = require('./manager');
const NftPickerOverlay = require('./overlays/nft-picker');
const PrepareStoreOverlay = require('./overlays/prepare-store');
const ListingDetailOverlay = require('./overlays/listing-detail');
const ListingInspectOverlay = require('./overlays/listing-inspect');
const RentalListingOverlay = require('./overlays/rental-listing');
const PurchaseOverlay = require('./overlays/purchase');
const Web3PaymentOverlay = require('./overlays/web3-payment');
const SettingsOverlay = require('./overlays/settings');
const SearchBox = require('./searchbox');
const SearchView = require('./search');
const PurchaseLifecycle = require('./purchase-lifecycle');
const ListingLifecycle = require('./listing-lifecycle');
const { normalizeListingMode } = require('../categories');
const { requestStoreWeb3Tickers } = require('./overlays/listing-field-edit');

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
    this.searchView = new SearchView(app, mod, '', {
      onPage: (offset) => this.activeSearch?.search(offset)
    });
    this.activeSearch = null;
    this.searchBox = new SearchBox(app, mod, {
      publicKey: '',
      onResults: (result) => this.showSearch(this.searchBox, result),
      onClear: () => this.clearSearch()
    });
    if (this.mod.header) {
      this.mod.header.searchBox = this.searchBox;
    }
    this.manager = new Manager(app, mod, '', {
      onSell: () => this.openSell(),
      onStoreModeChange: (mode) => this.onStoreModeChange(mode)
    });
    this.nft_picker = null;
    this.prepare_store = null;
    this.listing_detail = null;
    this.listing_inspect = null;
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

  showSearch(box, result) {
    this.activeSearch = box;
    this.manager.show('search');
    this.searchView.show(result);
  }

  clearSearch() {
    this.manager.show(this.composition === 'user-store' ? 'my-listings' : 'browse');
  }

  storeRoot() {
    return document.querySelector(`${this.container} .store`);
  }

  /**
   * Public storefronts share one header catalogue row.
   * Admin keeps the dashboard menu and hides that row.
   */
  setComposition(mode = 'marketplace', publicKey = '') {
    const next = mode === 'user-store' ? 'user-store' : mode === 'admin' ? 'admin' : 'marketplace';
    this.composition = next;

    const store = this.storeRoot();
    if (store) {
      store.classList.toggle('user-store', next === 'user-store');
      store.classList.toggle('admin-store', next === 'admin');
    }

    const sellerKey = next === 'marketplace' ? '' : String(publicKey || '').trim();
    this.mod.header?.setStorefront(sellerKey);

    if (next === 'admin') {
      this.menu.setMode('dashboard', {
        dashboardView: this.menu.dashboardView || 'store-admin'
      });
      return;
    }

    this.menu.mode = 'browse';
    this.mod.header?.paintCatalog?.();
  }

  onPathChange() {
    const route = this.mod.returnStoreRouteFromPath?.() || {
      publicKey: '',
      admin: false,
      moderate: false,
      category: ''
    };
    if (route.moderate) {
      void this.openModerate({ updateUrl: false });
      return;
    }
    if (route.publicKey) {
      this.openStorefront(route.publicKey, {
        updateUrl: false,
        admin: !!route.admin,
        category: route.category,
        featured: !!route.featured && !route.category && !route.admin
      });
      return;
    }
    const featured = !!route.featured && !route.category;
    this.setComposition('marketplace');
    this.menu.setActive(route.category || (featured ? 'featured' : ''));
    this.manager.show('browse');
    this.loadBrowsePage({ category: route.category || '', featured, page: 1 });
  }

  async initialize() {
    this.nft_picker = new NftPickerOverlay(this.app, this.mod);
    this.prepare_store = new PrepareStoreOverlay(this.app, this.mod);
    this.listing_detail = new ListingDetailOverlay(this.app, this.mod);
    this.listing_inspect = new ListingInspectOverlay(this.app, this.mod);
    this.rental_listing = new RentalListingOverlay(this.app, this.mod);
    this.purchase_overlay = new PurchaseOverlay(this.app, this.mod);
    this.web3_payment = new Web3PaymentOverlay(this.app, this.mod);
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

    this.menu.container = `${this.container} .store > .menu`;
    if (this.mod.header) {
      this.mod.header.searchBox = this.searchBox;
      this.mod.header.attachCatalog(`${this.container} .store > .store-catalog-nav`);
    }
    if (this.menu.mode === 'dashboard') {
      this.menu.render();
    }
    this.manager.render(`${this.container} .store > .main-column > .manager`);
    this.searchView.render(`${this.container} .store [data-panel="search"]`);
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

    if (view === 'withdrawals') {
      this.openWithdrawals();
      return;
    }

    if (view === 'moderation') {
      void this.openModerate();
      return;
    }

    if (view === 'featured') {
      this.setComposition('marketplace');
      this.menu.setActive('featured');
      this.manager.show('browse');
      this.setBrowseUrl({ featured: true });
      this.loadBrowsePage({ category: '', featured: true, page: 1, scroll: true });
      return;
    }

    // Category browse (data-category from menu items).
    if (Object.prototype.hasOwnProperty.call(opts, 'category') && opts.category) {
      const category = String(opts.category || '');
      this.setComposition('marketplace');
      this.menu.setActive(category);
      this.manager.show('browse');
      this.setBrowseUrl({ category });
      this.loadBrowsePage({
        category,
        featured: false,
        page: 1,
        scroll: true
      });
    }
  }

  loadBrowsePage({ category = '', page = 1, scroll = false, featured = false } = {}) {
    return this.manager.loadBrowsePage({ category, page, scroll, featured });
  }

  /**
   * Open a creator storefront or seller admin page.
   * Public /store/<pk> always shows the public storefront (even for the owner).
   * Admin /store/<pk>/admin requires the logged-in wallet to match <pk>.
   */
  async openStorefront(
    publicKey = '',
    {
      updateUrl = true,
      celebrate = false,
      dashboardView = 'store-admin',
      admin = false,
      category = '',
      featured
    } = {}
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
          adminSection: view === 'active' ? 'active' : 'home',
          category,
          featured: false
        });
      } else {
        this.setComposition('marketplace');
        await this.manager.showStorefront(key, { viewMode: 'admin-denied', category });
      }

      if (updateUrl) {
        this.setAdminUrl(key);
      }
      return;
    }

    const showFeatured = featured !== false && (!category || featured === true);
    this.setComposition('user-store', key);
    this.mod.header?.setCatalogActive?.(showFeatured ? 'featured' : category);
    await this.manager.showStorefront(key, {
      viewMode: 'public',
      category: showFeatured ? '' : category,
      featured: showFeatured
    });

    if (updateUrl) {
      this.setStorefrontUrl(key, showFeatured ? '' : category);
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

  openWithdrawals() {
    this.menu.dashboardView = 'withdrawals';
    this.setComposition('admin');
    this.manager.showWithdrawals();
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

  setBrowseUrl({ category = '', featured = false } = {}) {
    if (!this.app.BROWSER || typeof history === 'undefined') {
      return;
    }
    const slug = '/' + (this.mod.returnSlug?.() || 'store');
    const path = category ? `${slug}/category/${encodeURIComponent(category)}` : slug;
    if (window.location.pathname !== path) {
      history.pushState({ store: featured ? 'featured' : 'browse', category }, '', path);
    }
  }

  setModerateUrl() {
    if (!this.app.BROWSER || typeof history === 'undefined') {
      return;
    }
    const path = '/' + (this.mod.returnSlug?.() || 'store') + '/moderate';
    if (window.location.pathname !== path) {
      history.pushState({ store: 'moderate' }, '', path);
    }
  }

  openModerate({ updateUrl = true } = {}) {
    this.setComposition('marketplace');
    this.menu.setActive('moderation');
    void this.manager.showModerate();
    if (updateUrl) {
      this.setModerateUrl();
    }
  }

  setStorefrontUrl(publicKey = '', category = '') {
    if (!this.app.BROWSER || typeof history === 'undefined' || !publicKey) {
      return;
    }
    const base = this.mod.returnStorefrontPath?.(publicKey);
    const path = base && category ? `${base}/${encodeURIComponent(category)}` : base;
    if (path && window.location.pathname !== path) {
      history.pushState({ store: 'storefront', publicKey, category }, '', path);
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
    requestStoreWeb3Tickers(this.app);
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
