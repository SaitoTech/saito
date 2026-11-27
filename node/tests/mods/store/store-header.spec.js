/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const SaitoHeader = require('../../../lib/saito/ui/saito-header/saito-header');
const StoreHeader = require('../../../mods/store/lib/ui/header');

const OWN = 'a'.repeat(66);
const SELLER = 'b'.repeat(66);
const OTHER = 'c'.repeat(66);

function cryptoMod(ticker = 'SAITO') {
  return {
    ticker,
    balance: '12.50',
    categories: '',
    isActivated: () => true,
    returnAddress: () => 'wallet-address',
    returnDisplayBalance: () => '12.50',
    returnLogos: () => ({ img: '/saito/img/logo.svg', sub_logo: '' }),
    getAvailableBalance: async () => '12.50',
    getPendingBalance: async () => '12.50',
    startPolling: () => {}
  };
}

function insertHtml(html, parent) {
  const host = document.createElement('div');
  host.innerHTML = String(html).trim();
  const node = host.firstElementChild;
  if (node) {
    parent.appendChild(node);
  }
  return node;
}

function buildApp() {
  const preferred = cryptoMod();
  const listeners = {};
  return {
    options: { wallet: {} },
    connection: {
      on(name, fn) {
        listeners[name] = listeners[name] || [];
        listeners[name].push(fn);
      },
      emit(name, payload) {
        (listeners[name] || []).forEach((fn) => fn(payload));
      }
    },
    keychain: {
      returnKey: () => ({ identifier: 'Ada' }),
      returnIdentifierByPublicKey: () => 'Ada',
      returnUsername: (key) => (key === SELLER ? 'Northwind' : ''),
      returnIdenticon: () => '/saito/img/dreamscape.png'
    },
    wallet: {
      getPublicKey: async () => OWN,
      returnInstalledCryptos: () => [preferred],
      returnPreferredCrypto: () => preferred,
      updateNFTList: async () => {}
    },
    modules: {
      uimods: [],
      respondTo: () => [],
      renderInto: async () => {}
    },
    browser: {
      addStylesheet() {},
      escapeHTML: (value) =>
        String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;'),
      logoSVG: () =>
        '<svg class="saito-header-logo" viewBox="0 0 381 134"><path class="cls-1" d="M0 0"></path><path class="cls-1" d="M160 0"></path></svg>',
      isMobileBrowser: () => false,
      generateQRCode() {},
      returnBalanceHTML: (balance) => `<span class="balance-amount-whole">${balance}</span>`,
      formatDecimals: (balance) => String(balance),
      prependElementToDom: (html) => insertHtml(html, document.body),
      replaceElementById: (html, id) => {
        document.getElementById(id)?.remove();
        return insertHtml(html, document.body);
      },
      replaceElementBySelector: (html, selector) => {
        document.querySelector(selector)?.replaceWith(
          (() => {
            const host = document.createElement('div');
            host.innerHTML = String(html).trim();
            return host.firstElementChild;
          })()
        );
      },
      addElementToDom() {},
      addElementToSelector() {}
    }
  };
}

function buildMod(app) {
  const mod = {
    app,
    name: 'Store',
    slug: 'store',
    publicKey: OWN,
    listings_to_moderate: 0,
    returnSlug: () => 'store',
    use_floating_plus: false,
    main: {
      onNavigate: jest.fn(),
      openStorefront: jest.fn(),
      openSell: jest.fn(),
      openModerate: jest.fn(),
      menu: { has_store: false }
    }
  };
  return mod;
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('StoreHeader', () => {
  let header;

  beforeEach(() => {
    document.body.innerHTML = '';
    global.sanitize = (value) => String(value);
    global.navigateWindow = jest.fn();
    const app = buildApp();
    const mod = buildMod(app);
    header = new StoreHeader(app, mod);
    header.publicKey = OWN;
    header.searchBox = {
      term: 'kept',
      setPublicKey(key) {
        this.publicKey = key;
      },
      mount(slot) {
        slot.innerHTML =
          '<form data-store-search-form><input data-store-search-input value=""></form>';
        this.mounts = (this.mounts || 0) + 1;
      }
    };
  });

  afterEach(() => {
    clearTimeout(header.web3_start_polling_timeout);
  });

  test('subclasses the Saito header and renders one header', async () => {
    expect(header).toBeInstanceOf(SaitoHeader);
    expect(Object.getPrototypeOf(StoreHeader.prototype)).toBe(SaitoHeader.prototype);

    await header.render();
    await flush();

    expect(document.querySelectorAll('#saito-header')).toHaveLength(1);
    expect(document.querySelector('#saito-header-menu-toggle')).not.toBeNull();
    expect(document.querySelector('.saito-header-hamburger-contents')).not.toBeNull();
    expect(document.querySelector('#header-msg').textContent).toBe('Ada');
    expect(document.querySelector('.balance-amount').textContent).toContain('12.50');
    expect(document.querySelector('.saito-header-logo').getAttribute('viewBox')).toBe('0 0 381 134');
    expect(document.querySelector('.store-header-identity')).toBeNull();
    expect(document.querySelector('.pubkey-container .fa-copy')).not.toBeNull();
  });

  test('seller identity replaces the wordmark and survives logo reset', async () => {
    header.storeKey = SELLER;
    await header.render();
    await flush();

    const identity = document.querySelector('.store-header-identity');
    expect(identity).not.toBeNull();
    expect(identity.querySelector('.store-header-name').textContent).toBe('Northwind');
    expect(identity.querySelector('.store-header-key').textContent).toBe(SELLER);
    expect(identity.querySelector('button')).toBeNull();
    expect(document.querySelector('.saito-header-logo').getAttribute('viewBox')).toBe('0 0 118 134');
    expect(document.querySelector('#header-msg').textContent).toBe('Ada');

    header.resetHeaderLogo();
    expect(document.querySelectorAll('.store-header-identity')).toHaveLength(1);
    expect(document.querySelector('.store-header-name').textContent).toBe('Northwind');
    expect(document.querySelectorAll('#saito-header')).toHaveLength(1);
  });

  test('wallet updates still repaint the inherited balance', async () => {
    await header.initialize(header.app);
    await header.render();
    await flush();
    const preferred = header.app.wallet.returnPreferredCrypto();
    preferred.balance = '40';
    preferred.returnDisplayBalance = () => '40';
    preferred.getAvailableBalance = async () => '40';
    preferred.getPendingBalance = async () => '40';
    header.app.connection.emit('wallet-updated');
    await flush();
    expect(document.querySelector('.balance-amount').textContent).toContain('40');
    expect(document.querySelectorAll('#saito-header')).toHaveLength(1);
  });

  test('hamburger still opens the inherited slide-in menu', async () => {
    await header.render();
    document.querySelector('#saito-header-menu-toggle').click();
    expect(
      document.querySelector('.saito-header-hamburger-contents').classList.contains('show-menu')
    ).toBe(true);
    document.querySelector('#saito-header-menu-toggle').click();
    expect(
      document.querySelector('.saito-header-hamburger-contents').classList.contains('show-menu')
    ).toBe(false);
  });

  test('manage store follows the storefront being viewed', async () => {
    await header.render();
    expect(document.getElementById('saito_header_menu_item_store_list')).not.toBeNull();
    expect(document.getElementById('saito_header_menu_item_store_manage')).toBeNull();

    header.mod.main.menu.has_store = true;
    header.syncUtilityMenu();
    expect(document.getElementById('saito_header_menu_item_store_mine')).not.toBeNull();
    expect(document.getElementById('saito_header_menu_item_store_list')).toBeNull();

    header.setStorefront(OTHER);
    expect(document.getElementById('saito_header_menu_item_store_manage')).toBeNull();
    expect(document.getElementById('saito_header_menu_item_store_mine')).toBeNull();

    header.setStorefront(OWN);
    const manage = document.getElementById('saito_header_menu_item_store_manage');
    expect(manage).not.toBeNull();
    manage.click();
    expect(header.mod.main.openStorefront).toHaveBeenCalledWith(OWN, { admin: true });

    header.setStorefront('');
    expect(document.getElementById('saito_header_menu_item_store_manage')).toBeNull();
    expect(document.querySelector('.store-header-identity')).toBeNull();
    expect(document.querySelector('.saito-header-logo').getAttribute('viewBox')).toBe('0 0 381 134');
  });

  test('catalogue navigation and search share one state', async () => {
    await header.render();
    document.body.innerHTML += '<nav class="store-catalog-nav"></nav>';
    header.attachCatalog('.store-catalog-nav');
    header.setCatalog({
      categories: [{ category_id: 'prints', name: 'Prints & Goods' }],
      active: 'featured',
      featuredVisible: true
    });

    const links = [...document.querySelectorAll('.store-nav-link')].map((node) => node.textContent);
    expect(links).toEqual(['Home', 'Prints & Goods']);
    expect(document.querySelector('[data-nav="home"]').classList.contains('is-active')).toBe(true);
    expect(header.searchBox.mounts).toBe(1);

    document.querySelector('[data-category="prints"]').click();
    expect(header.mod.main.onNavigate).toHaveBeenCalledWith('', { category: 'prints' });
    expect(document.querySelector('[data-category="prints"]').classList.contains('is-active')).toBe(
      true
    );

    header.setStorefront(SELLER);
    expect(header.searchBox.publicKey).toBe(SELLER);
    expect(header.searchBox.term).toBe('');
    expect(header.searchBox.mounts).toBe(1);

    document.querySelector('[data-nav="home"]').click();
    expect(header.mod.main.openStorefront).toHaveBeenCalledWith(SELLER, {
      category: '',
      featured: true,
      admin: false
    });

    header.setCatalog({
      categories: [{ category_id: 'prints', name: 'Prints & Goods' }],
      active: 'prints',
      featuredVisible: false
    });
    expect(document.querySelector('[data-nav="home"]')).toBeNull();
    expect(document.querySelector('[data-category="prints"]').classList.contains('is-active')).toBe(
      true
    );
  });

  test('other applications still construct the standard header', () => {
    const arcade = fs.readFileSync(
      path.join(__dirname, '../../../mods/arcade/arcade.js'),
      'utf8'
    );
    const store = fs.readFileSync(path.join(__dirname, '../../../mods/store/store.js'), 'utf8');
    expect(arcade).toContain('new SaitoHeader');
    expect(arcade).not.toContain('StoreHeader');
    expect(store).toContain('new StoreHeader');
    expect(store).not.toContain('new SaitoHeader');
  });
});
