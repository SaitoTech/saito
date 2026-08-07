const StorefrontViewTemplate = require('./storefront-view.template');
const Teasers = require('./teasers');
const EmptyPanel = require('./empty-panel');
const { loadListingsPage } = require('./browse-listings');
const { MAX_PAGE_SIZE } = require('../categories');

class StorefrontView {
  constructor(app, mod, container = '', callbacks = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.onSell = callbacks.onSell;
    this.onViewChange = callbacks.onViewChange;
    this.publicKey = '';
    /** @type {import('../summary')[]} */
    this.activeSummaries = [];
    this.inventoryLoaded = false;
    this.loading = false;
    this.loadToken = 0;
    this.successArmed = false;
    this.successVisible = false;
    this.successDismissed = false;

    this.teasers = new Teasers(app, mod, '');
    this.empty = new EmptyPanel(app, mod, {
      title: 'No listings yet',
      body: 'Items you put up for sale will appear here.',
      actionLabel: 'Add New Listing',
      onAction: () => this.onSell?.()
    });
    /** @type {'public' | 'admin' | 'admin-denied'} */
    this.viewMode = 'public';
    /** @type {'home' | 'active'} Admin content section when viewMode is admin */
    this.adminSection = 'home';

    // Progress overlay complete → refresh inventory from warehouse (no local injection).
    this.app.connection.on('store-listing-lifecycle', (entry) => {
      if (!this.publicKey || entry?.phase !== 'complete') {
        return;
      }
      if (this.successArmed && !this.successDismissed && this.isAdminHome()) {
        this.successVisible = true;
        this.renderSuccessBanner();
      }
      if (this.isOwnStorefront() || this.viewMode === 'public') {
        this.reloadInventory().then(() => {
          const manager = this.mod.main?.manager;
          if (manager?.activePanel === 'sales') {
            manager.sales.show();
          }
        });
      }
    });

    this.app.connection.on('store-profile-link-updated', () => {
      if (this.isAdminHome()) {
        this.render();
      }
    });
  }

  armSuccessBanner() {
    this.successArmed = true;
    this.successDismissed = false;
    this.successVisible = false;
  }

  clearSuccessBanner() {
    this.successVisible = false;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!this.container) {
      return;
    }

    if (this.viewMode === 'admin-denied') {
      this.app.browser.replaceElementContentBySelector(
        StorefrontViewTemplate({
          adminDenied: true
        }),
        this.container
      );
      return;
    }

    const isDashboard = this.isAdminMode();
    const rawTitle = this.app.keychain?.returnUsername?.(this.publicKey) || 'Store';
    const shareUrl = this.publicKey ? this.mod.returnStorefrontUrl?.(this.publicKey) || '' : '';

    this.app.browser.replaceElementContentBySelector(
      StorefrontViewTemplate({
        title: this.escapeHtml(rawTitle),
        description: '',
        shareUrl,
        loading:
          !!this.publicKey && this.loading && (this.viewMode === 'public' || this.isAdminActive()),
        isDashboard,
        adminSection: this.adminSection,
        showSuccess: this.isAdminHome() && this.successVisible,
        profileLinkChecked: this.returnProfileLinkChecked(shareUrl)
      }),
      this.container
    );

    this.teasers.container = `${this.container} .teasers`;
    this.attachHeaderEvents(shareUrl);

    if (!this.publicKey) {
      return;
    }

    if (this.isAdminHome()) {
      return;
    }

    if (this.loading) {
      return;
    }

    this.renderResults();
  }

  renderSuccessBanner() {
    const root = document.querySelector(this.container);
    if (!root || !this.isAdminHome()) {
      return;
    }

    let banner = root.querySelector('[data-listing-success]');
    if (this.successVisible && !banner) {
      this.render();
      return;
    }
    if (!this.successVisible && banner) {
      banner.remove();
    }
  }

  attachHeaderEvents(shareUrl = '') {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    const copyBtn = root.querySelector('[data-action="copy-url"]');
    if (copyBtn) {
      copyBtn.onclick = async (e) => {
        e.preventDefault();
        const urlEl = root.querySelector('[data-storefront-url]');
        const raw = (urlEl?.getAttribute('href') || urlEl?.textContent || shareUrl || '').trim();
        if (!raw) {
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(raw);
          } else {
            const input = document.createElement('input');
            input.value = raw;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
          }
          if (typeof siteMessage === 'function') {
            siteMessage('Storefront URL copied', 1500);
          }
        } catch (err) {
          console.warn('Store: copy storefront URL failed', err?.message || err);
        }
      };
    }

    root.querySelector('[data-action="list-item"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.onSell?.();
    });

    const profileToggle = root.querySelector('[data-action="toggle-profile-link"]');
    if (profileToggle) {
      profileToggle.addEventListener('change', async () => {
        const url = this.mod.returnStorefrontUrl?.(this.mod.publicKey) || shareUrl || '';
        try {
          if (profileToggle.checked) {
            if (url) {
              await this.mod.updateProfile?.(url);
            }
          } else {
            await this.mod.updateProfile?.('');
          }
        } catch (err) {
          console.warn('Store: profile link toggle failed', err?.message || err);
          profileToggle.checked = !profileToggle.checked;
        }
      });
    }

    root.querySelector('[data-action="dismiss-success"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.successVisible = false;
      this.successDismissed = true;
      this.successArmed = false;
      root.querySelector('[data-listing-success]')?.remove();
    });
  }

  /**
   * Welcome (no listings yet): always unchecked.
   * After the store has listings: checked iff Profile contains this storefront URL.
   */
  returnProfileLinkChecked(shareUrl = '') {
    if (!this.isAdminHome() || !this.isOwnStorefront()) {
      return false;
    }
    if (!this.inventoryLoaded || this.activeSummaries.length === 0) {
      return false;
    }
    const url = String(shareUrl || this.mod.returnStorefrontUrl?.(this.mod.publicKey) || '').trim();
    if (!url) {
      return false;
    }
    return this.mod.returnProfileStoreUrl?.() === url;
  }

  /**
   * Show a creator storefront or admin view for the given public key.
   * Active listings via load-listings (same API as marketplace browse).
   * @param {string} publicKey
   * @param {{ viewMode?: 'public' | 'admin' | 'admin-denied', adminSection?: 'home' | 'active' }} [opts]
   */
  async show(publicKey = '', { viewMode = 'public', adminSection = 'home' } = {}) {
    const nextKey = String(publicKey || '').trim();
    if (!nextKey) {
      return;
    }

    const nextViewMode = viewMode === 'admin' || viewMode === 'admin-denied' ? viewMode : 'public';
    const nextSection = adminSection === 'active' ? 'active' : 'home';
    const reuseAdminData =
      this.publicKey === nextKey &&
      this.viewMode === 'admin' &&
      nextViewMode === 'admin' &&
      this.inventoryLoaded &&
      !this.loading;

    this.publicKey = nextKey;
    this.viewMode = nextViewMode;
    this.adminSection = nextSection;

    if (this.viewMode === 'admin-denied') {
      this.loading = false;
      this.render();
      return;
    }

    // Switch Store Admin ↔ Active Listings without refetching when data is warm.
    if (reuseAdminData && nextSection === 'home') {
      this.render();
      return;
    }
    if (reuseAdminData && nextSection === 'active' && !this.loading) {
      this.render();
      return;
    }

    this.inventoryLoaded = false;
    await this.reloadInventory();
  }

  async reloadInventory() {
    if (!this.publicKey) {
      return;
    }

    this.loading = true;
    const token = ++this.loadToken;
    this.render();

    try {
      const result = await loadListingsPage(this.app, this.mod, {
        public_key: this.publicKey,
        category: '',
        offset: 0,
        page_size: MAX_PAGE_SIZE
      });
      if (token !== this.loadToken) {
        return;
      }
      this.activeSummaries = result.listings || [];
      this.inventoryLoaded = true;
    } catch (err) {
      console.warn('Store: load-listings (storefront) failed', err?.message || err);
      if (token !== this.loadToken) {
        return;
      }
      this.activeSummaries = [];
      this.inventoryLoaded = true;
    }

    if (token !== this.loadToken) {
      return;
    }

    this.loading = false;
    this.render();
  }

  isOwnStorefront() {
    const walletKey = this.mod.publicKey || '';
    return !!this.publicKey && !!walletKey && this.publicKey === walletKey;
  }

  isAdminMode() {
    return this.viewMode === 'admin' && this.isOwnStorefront();
  }

  isAdminHome() {
    return this.isAdminMode() && this.adminSection !== 'active';
  }

  isAdminActive() {
    return this.isAdminMode() && this.adminSection === 'active';
  }

  renderResults() {
    const status = document.querySelector(`${this.container} [data-storefront-status]`);
    if (status) {
      status.hidden = true;
      status.innerHTML = '';
    }

    const teasersEl = document.querySelector(`${this.container} .teasers`);
    if (!teasersEl) {
      return;
    }

    const visible = this.returnVisibleSummaries();
    if (!visible.length) {
      teasersEl.innerHTML = '';
      const emptyHost = document.createElement('div');
      emptyHost.className = 'storefront-empty';
      teasersEl.appendChild(emptyHost);

      if (this.isAdminActive()) {
        this.empty.title = 'No active listings.';
        this.empty.body = '';
        this.empty.actionLabel = '+ Add New Listing';
        this.empty.onAction = () => this.onSell?.();
      } else {
        this.empty.title = 'No listings yet';
        this.empty.body = 'This creator has not published any listings yet.';
        this.empty.actionLabel = '';
        this.empty.onAction = null;
      }
      this.empty.render(`${this.container} .storefront-empty`);
      return;
    }

    this.teasers.render(`${this.container} .teasers`, visible);
  }

  returnVisibleSummaries() {
    return this.filterHiddenListings(this.activeSummaries);
  }

  filterHiddenListings(summaries = []) {
    const lifecycle = this.mod.purchase_lifecycle;
    if (!lifecycle?.isListingHidden) {
      return summaries;
    }
    return summaries.filter((summary) => !lifecycle.isListingHidden(summary));
  }

  escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = StorefrontView;
