const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function page(t, options) {
  const dom = new JSDOM(read('mods/website/web/index.html'), {
    url: 'https://example.test/',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const timers = [];
  window.setTimeout = (callback) => timers.push(callback);
  window.clearTimeout = () => {};
  window.setInterval = () => {};
  window.requestAnimationFrame = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.SVGElement.prototype.getTotalLength = () => 100;
  window.fetch = () => new Promise(() => {});
  window.console = { log() {}, info() {}, warn() {}, error() {} };
  window.Pace = { restart() {}, stop() {} };
  if (options) window.localStorage.setItem('options', JSON.stringify(options));
  window.eval(read('mods/website/web/js/site-2026.js'));
  t.after(() => dom.window.close());
  return { window, document: window.document, timers };
}

async function installWebsite(window) {
  class ModTemplate {
    constructor(app) {
      this.app = app;
      this.browser_active = 1;
    }
    async initialize() {}
    addComponent(component) {
      this.component = component;
    }
    async render() {
      await this.component.render();
    }
  }
  class Header {
    async initialize() {}
    async render() {
      window.document.getElementById('saito-header')?.remove();
      window.document.body.insertAdjacentHTML(
        'afterbegin',
        `
        <header id="saito-header">
          <button id="saito-header-menu-toggle"></button>
          <div class="saito-header-hamburger-contents"></div>
          <div class="saito-header-backdrop"></div>
        </header>`
      );
    }
    openMenu() {
      window.document.querySelector('.saito-header-hamburger-contents').classList.add('show-menu');
      window.document.querySelector('.saito-header-backdrop').classList.add('menu-visible');
    }
    hideMenu() {
      window.document
        .querySelector('.saito-header-hamburger-contents')
        .classList.remove('show-menu');
      window.document.querySelector('.saito-header-backdrop').classList.remove('menu-visible');
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(read('mods/website/website.js'), {
    module,
    require: (name) =>
      name === 'path' ? path : name.endsWith('modtemplate') ? ModTemplate : Header,
    window,
    document: window.document,
    CustomEvent: window.CustomEvent,
    console: window.console
  });
  const app = {
    BROWSER: 1,
    wallet: { getPublicKey: async () => 'my-key' },
    network: { getPeers: async () => [{ publicKey: 'peer-key' }] },
    connection: new EventEmitter(),
    options: {}
  };
  const website = new module.exports(app);
  await website.initialize(app);
  await website.render();
  return { website, app };
}

test('default and local browser builds include the Website status bridge', () => {
  const defaults = require('../../../config/.template.modules.config');
  assert.ok(defaults.lite.includes('website/website.js'));
  const local = vm.runInNewContext(
    read('config/modules.config.js').replace('export default', 'moduleConfig =')
  );
  assert.ok(local.lite.includes('website/website.js'));
});

test('a handshake completes join and subsequent logs cannot reset progress', async (t) => {
  const { window, document } = page(t);
  document.querySelector('[data-network-check]').click();
  const { app, website } = await installWebsite(window);
  app.connection.emit('on_peer_handshake_complete', 1n, 'peer-key');
  await website.publishBrowserNetworkStatus();
  assert.equal(document.querySelector('[data-network-join-percent]').textContent, '100%');
  assert.equal(document.querySelector('[data-network-check]').disabled, false);
  assert.match(document.querySelector('[data-network-check]').textContent, /Try apps/);
  window.console.log('Installing: another module');
  assert.equal(document.querySelector('[data-network-join-percent]').textContent, '100%');
  assert.equal(document.querySelector('[data-saito-menu-toggle]').hidden, false);
});

test('mobile navigation keeps its links and Profile opens the application sidebar', async (t) => {
  const { window, document } = page(t);
  assert.equal(document.querySelector('[data-saito-profile]').hidden, true);
  await installWebsite(window);
  const mobileToggle = document.querySelector('[data-menu-toggle]');
  const profile = document.querySelector('[data-saito-profile]');
  mobileToggle.click();
  assert.equal(mobileToggle.getAttribute('aria-controls'), 'mobile-navigation');
  assert.equal(document.querySelector('.mobile-nav-main').firstElementChild, profile);
  assert.equal(document.activeElement, profile);
  profile.click();
  assert.equal(document.querySelector('[data-mobile-nav]').classList.contains('is-open'), false);
  assert.ok(document.querySelector('.saito-header-hamburger-contents.show-menu'));
  assert.equal(mobileToggle.getAttribute('aria-expanded'), 'false');
});

test('desktop menu uses the current sidebar after header replacement and during reconnection', async (t) => {
  const { window, document } = page(t);
  const { website } = await installWebsite(window);
  const toggle = document.querySelector('[data-saito-menu-toggle]');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await website.header.render();
  toggle.click();
  assert.ok(document.querySelector('#saito-sidebar.show-menu'));
  await website.publishBrowserNetworkStatus('syncing');
  assert.equal(toggle.hidden, false);
  assert.ok(document.querySelector('#saito-sidebar.show-menu'));
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('.saito-header-backdrop.menu-visible'), null);
});

test('a returning wallet starts automatically and gets menus before connecting', async (t) => {
  const { window, document, timers } = page(t, { wallet: { publicKey: 'existing-key' } });
  assert.equal(window.active_module, 'website');
  for (const timer of timers.splice(0)) timer();
  assert.ok(document.querySelector('script[data-saito-browser-bundle]'));
  await installWebsite(window);
  assert.equal(document.querySelector('[data-saito-menu-toggle]').hidden, false);
  assert.equal(document.querySelector('[data-saito-profile]').hidden, false);
});

test('a failed bundle download can be retried', async (t) => {
  const { window, document } = page(t);
  const button = document.querySelector('[data-network-check]');
  button.click();
  const failed = document.querySelector('script[data-saito-browser-bundle]');
  failed.onerror();
  await new Promise(setImmediate);
  assert.equal(button.disabled, false);
  assert.equal(document.querySelector('script[data-saito-browser-bundle]'), null);
  button.click();
  assert.ok(document.querySelector('script[data-saito-browser-bundle]'));
  assert.equal(button.disabled, true);
});

test('an entry point error reports join failure instead of leaving the promise pending', async (t) => {
  const { window, document } = page(t);
  await new Promise(setImmediate);
  document.querySelector('[data-network-check]').click();
  window.onload = async () => {
    throw new Error('Initialization failed');
  };
  await document.querySelector('script[data-saito-browser-bundle]').onload();
  await new Promise(setImmediate);
  assert.equal(document.querySelector('[data-network-check]').disabled, false);
  assert.equal(
    document.querySelector('[data-network-join-status]').textContent,
    'Unable to join the network'
  );
});
