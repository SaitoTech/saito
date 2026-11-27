const SaitoHeader = require('../../../../lib/saito/ui/saito-header/saito-header');
const { identityTemplate, catalogLinksTemplate } = require('./header.template');

const WORDMARK_VIEWBOX = '0 0 381 134';
const CUBE_VIEWBOX = '0 0 118 134';

const MENU_MANAGE = 'saito_header_menu_item_store_manage';
const MENU_MINE = 'saito_header_menu_item_store_mine';
const MENU_LIST = 'saito_header_menu_item_store_list';
const MENU_MODERATE = 'saito_header_menu_item_store_moderate';
const UTILITY_IDS = [MENU_MANAGE, MENU_MINE, MENU_LIST, MENU_MODERATE];

class StoreHeader extends SaitoHeader {
  constructor(app, mod) {
    super(app, mod);
    this.header_class = 'store';
    this.storeKey = '';
    this.catalogCategories = [];
    this.catalogActive = 'featured';
    this.featuredVisible = true;
    this.searchBox = null;
    this.catalogNav = null;
  }

  async initialize(app) {
    await super.initialize(app);
    app.connection.on('registry-update-identifier', (publicKey) => {
      if (publicKey && publicKey === this.storeKey) {
        this.paintIdentity();
      }
    });
  }

  async render() {
    await super.render();
    this.paintIdentity();
    this.syncUtilityMenu();
  }

  resetHeaderLogo() {
    super.resetHeaderLogo();
    this.paintIdentity();
  }

  setStorefront(publicKey = '') {
    const key = String(publicKey || '').trim();
    const changed = key !== this.storeKey;
    this.storeKey = key;
    if (changed && this.searchBox) {
      this.searchBox.term = '';
      const input = this.catalogNav?.querySelector('[data-store-search-input]');
      if (input) {
        input.value = '';
      }
    }
    this.paintIdentity();
    this.paintCatalog();
    this.syncUtilityMenu();
  }

  setCatalog({ categories = [], active = this.catalogActive, featuredVisible } = {}) {
    this.catalogCategories = Array.isArray(categories) ? categories : [];
    if (featuredVisible != null) {
      this.featuredVisible = featuredVisible !== false && featuredVisible !== 0;
    }
    this.catalogActive = this.normalizeActive(active);
    this.paintCatalog();
  }

  setCatalogActive(view = '') {
    this.catalogActive = this.normalizeActive(view);
    const links = this.catalogNav?.querySelector('.store-catalog-links');
    if (!links || !links.childElementCount) {
      this.paintCatalog();
      return;
    }
    const homeOn = this.featuredVisible && (this.catalogActive === 'featured' || this.catalogActive === '');
    links.querySelectorAll('[data-nav]').forEach((button) => {
      const on =
        button.getAttribute('data-nav') === 'home'
          ? homeOn
          : button.getAttribute('data-category') === this.catalogActive;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }

  attachCatalog(selector = '') {
    const nav = selector ? document.querySelector(selector) : document.querySelector('.store-catalog-nav');
    if (!nav) {
      return;
    }
    if (!nav.querySelector('.store-catalog-links')) {
      nav.innerHTML =
        '<div class="store-catalog-links"></div><div class="store-search-slot" data-store-search></div>';
    }
    if (this.catalogNav !== nav) {
      this.catalogNav = nav;
      nav.addEventListener('click', (event) => this.onCatalogClick(event));
    }
    this.paintCatalog();
  }

  onCatalogClick(event) {
    const button = event.target.closest?.('[data-nav]');
    if (!button || !this.catalogNav?.contains(button)) {
      return;
    }
    const kind = button.getAttribute('data-nav');
    if (kind === 'home') {
      this.setCatalogActive('featured');
      this.openCatalog('', true);
      return;
    }
    if (kind === 'category') {
      const category = button.getAttribute('data-category') || '';
      this.setCatalogActive(category);
      this.openCatalog(category, false);
    }
  }

  openCatalog(category = '', featured = false) {
    if (this.storeKey) {
      this.mod.main?.openStorefront?.(this.storeKey, {
        category: featured ? '' : category,
        featured,
        admin: false
      });
      return;
    }
    if (featured) {
      this.mod.main?.onNavigate?.('featured', {});
      return;
    }
    this.mod.main?.onNavigate?.('', { category });
  }

  paintIdentity() {
    const header = document.getElementById('saito-header');
    if (!header) {
      return;
    }
    const seller = String(this.storeKey || '').trim();
    header.classList.toggle('store-seller', Boolean(seller));
    const svg = header.querySelector('.saito-header-logo');
    if (svg) {
      svg.setAttribute('viewBox', seller ? CUBE_VIEWBOX : WORDMARK_VIEWBOX);
    }
    header.querySelector('.store-header-identity')?.remove();
    if (!seller) {
      return;
    }
    const wrapper = header.querySelector('.saito-header-logo-wrapper');
    if (!wrapper) {
      return;
    }
    wrapper.insertAdjacentHTML(
      'afterend',
      identityTemplate({
        name: this.returnSellerName(seller),
        publicKey: seller
      })
    );
  }

  paintCatalog() {
    const nav = this.catalogNav;
    if (!nav) {
      return;
    }
    let links = nav.querySelector('.store-catalog-links');
    let slot = nav.querySelector('[data-store-search]');
    if (!links || !slot) {
      nav.innerHTML =
        '<div class="store-catalog-links"></div><div class="store-search-slot" data-store-search></div>';
      links = nav.querySelector('.store-catalog-links');
      slot = nav.querySelector('[data-store-search]');
    }
    if (links) {
      links.innerHTML = catalogLinksTemplate({
        showHome: this.featuredVisible,
        categories: this.catalogCategories,
        active: this.catalogActive
      });
    }
    if (slot && this.searchBox) {
      this.searchBox.setPublicKey(this.storeKey || '');
      if (!slot.querySelector('[data-store-search-form]')) {
        this.searchBox.mount(slot);
      }
    }
  }

  returnSellerName(publicKey = '') {
    const key = String(publicKey || '').trim();
    const named = String(this.app.keychain?.returnUsername?.(key) || '').trim();
    if (named && named !== key) {
      return named;
    }
    if (!key) {
      return '';
    }
    return `Anon-${key.slice(0, 6)}`;
  }

  normalizeActive(view = '') {
    const next = String(view || '').trim();
    if (!next || next === 'featured') {
      return 'featured';
    }
    return next;
  }

  syncUtilityMenu() {
    const specs = this.utilityMenuSpecs();
    const wanted = new Set(specs.map((spec) => spec.id));
    UTILITY_IDS.forEach((id) => {
      if (wanted.has(id)) {
        return;
      }
      document.getElementById(id)?.remove();
      delete this.callbacks[id];
    });
    specs.forEach((spec) => {
      this.callbacks[spec.id] = spec.callback;
      if (document.getElementById(spec.id)) {
        return;
      }
      this.addMenuItem(
        {
          text: spec.text,
          icon: spec.icon,
          type: 'navigation'
        },
        spec.id
      );
      this.bindUtilityItem(spec.id);
    });
  }

  utilityMenuSpecs() {
    const ownKey = String(this.mod?.publicKey || '').trim();
    const storeKey = String(this.storeKey || '').trim();
    const ownStore = Boolean(ownKey && storeKey && storeKey === ownKey);
    const onMain = !storeKey;
    const hasStore = Boolean(this.mod?.main?.menu?.has_store);
    const pending = Math.max(0, Number(this.mod?.listings_to_moderate) || 0);
    const specs = [];

    if (ownStore) {
      specs.push({
        id: MENU_MANAGE,
        text: 'Manage Store',
        icon: 'fa-solid fa-gear',
        callback: () => this.openOwnAdmin()
      });
    } else if (onMain && hasStore) {
      specs.push({
        id: MENU_MINE,
        text: 'My Saito Store',
        icon: 'fa-solid fa-store',
        callback: () => this.openOwnAdmin()
      });
    } else if (onMain) {
      specs.push({
        id: MENU_LIST,
        text: 'List Item for Sale',
        icon: 'fa-solid fa-plus',
        callback: () => this.mod.main?.openSell?.()
      });
    }

    if (pending > 0) {
      specs.push({
        id: MENU_MODERATE,
        text: 'Moderate',
        icon: 'fa-solid fa-clipboard-check',
        callback: () => this.mod.main?.openModerate?.()
      });
    }

    return specs;
  }

  openOwnAdmin() {
    const key = String(this.mod?.publicKey || '').trim();
    if (!key) {
      return;
    }
    this.mod.main?.openStorefront?.(key, { admin: true });
  }

  bindUtilityItem(id = '') {
    const item = document.getElementById(id);
    if (!item || item.dataset.storeBound === '1') {
      return;
    }
    item.dataset.storeBound = '1';
    item.addEventListener('click', (event) => {
      event.preventDefault();
      this.toggleMenu();
      const callback = this.callbacks[id];
      if (typeof callback === 'function') {
        callback(this.app, item.getAttribute('data-id'));
      }
    });
  }
}

module.exports = StoreHeader;
