const ManagerTemplate = require('./manager.template');
const BrowseView = require('./browse-view');
const StorefrontView = require('./storefront-view');
const SalesView = require('./sales-view');

class Manager {
  constructor(app, mod, container = '', callbacks = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.activePanel = 'browse';
    this.onStoreModeChange = callbacks.onStoreModeChange;

    const onViewChange = (mode) => {
      if (typeof this.onStoreModeChange === 'function') {
        this.onStoreModeChange(mode);
      }
    };

    this.browse = new BrowseView(app, mod, '');
    this.storefront = new StorefrontView(app, mod, '', {
      onSell: callbacks.onSell,
      onViewChange
    });
    this.sales = new SalesView(app, mod, '');
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!this.container) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(ManagerTemplate(), this.container);

    this.browse.render(`${this.container} [data-panel="browse"]`);
    this.storefront.render(`${this.container} [data-panel="my-listings"]`);
    this.sales.render(`${this.container} [data-panel="sales"]`);

    this.show(this.activePanel);
  }

  show(panel = 'browse') {
    this.activePanel = panel || 'browse';

    if (!this.container) {
      return;
    }

    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-panel]').forEach((el) => {
      const match = el.getAttribute('data-panel') === this.activePanel;
      el.classList.toggle('is-active', match);
    });
  }

  /**
   * Open the creator storefront / admin panel for a public key.
   * @param {string} publicKey
   * @param {{ viewMode?: 'public' | 'admin' | 'admin-denied', adminSection?: 'home' | 'active' }} [opts]
   */
  showStorefront(publicKey = '', { viewMode = 'public', adminSection = 'home' } = {}) {
    this.show('my-listings');
    return this.storefront.show(publicKey, { viewMode, adminSection });
  }

  showSales() {
    this.show('sales');
    return this.sales.show();
  }

  scrollToListings() {
    this.browse.scrollToListings();
  }

  renderListings() {
    this.browse.renderListings();
  }

  loadBrowsePage({ category = '', page = 1, scroll = false } = {}) {
    this.show('browse');
    return this.browse.loadPage({ category, page, scroll });
  }

  reloadBrowsePage() {
    if (this.activePanel !== 'browse') {
      return;
    }
    return this.browse.loadPage({
      category: this.browse.category,
      page: this.browse.page,
      scroll: false
    });
  }
}

module.exports = Manager;
