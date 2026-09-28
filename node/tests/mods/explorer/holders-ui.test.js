const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
process.env.TS_NODE_PROJECT = 'config/build/tsconfig.json';
require('ts-node/register/transpile-only');

const Explorer = require('../../../mods/explorer/explorer');
const Holders = require('../../../mods/explorer/lib/ui/holders');
const HoldersTemplate = require('../../../mods/explorer/lib/ui/holders.template');
const { getHoldersPage } = require('../../../mods/explorer/lib/holders');
const { handleExplorerRequest } = require('../../../mods/explorer/lib/peer/requests');

const HASH = 'a'.repeat(64);
function setup(t, path = '/explorer/holders?page=1') {
  const dom = new JSDOM('<div class="saito-container"><div class="explorer-view"></div></div>', {
    url: `https://example.test${path}`
  });
  const oldWindow = global.window;
  const oldDocument = global.document;
  const oldAnimationFrame = global.requestAnimationFrame;
  global.window = dom.window;
  global.document = dom.window.document;
  global.requestAnimationFrame = (callback) => callback();
  const requests = [];
  const app = {
    BROWSER: 1,
    browser: {
      escapeHTML: (value) =>
        String(value).replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        ),
      replaceElementContentBySelector: (html, selector) => {
        document.querySelector(selector).innerHTML = html;
      }
    },
    network: {
      sendRequestAsTransaction: (request, data, callback, peer) => {
        requests.push({ request, data, callback, peer });
      }
    }
  };
  const mod = new Explorer(app);
  mod.shellRendered = true;
  mod.browser_active = 1;
  mod.explorerPeer = { publicKey: 'peer' };
  t.after(() => {
    mod.cleanupListViews();
    dom.window.close();
    global.window = oldWindow;
    global.document = oldDocument;
    global.requestAnimationFrame = oldAnimationFrame;
  });
  return { app, mod, requests, dom };
}

async function pageData(page = 1) {
  return getHoldersPage(
    {
      getSupplyBalanceSnapshot: async () => ({
        file_name: `1725000000000-123-${HASH}.snap`,
        rows: Array.from({ length: 26 }, (_, i) => `key${i} 123 0 0 ${26 - i} 0`)
      })
    },
    { page }
  );
}

test('direct routes, next page, Back state and peer reconnection preserve correct pagination', async (t) => {
  const { mod, requests, app } = setup(t);
  assert.deepEqual(mod.parseRoute(), { view: 'holders', page: 1 });
  await mod.renderHolders({ animate: false, pushState: false });
  requests[0].callback({ success: true, data: await pageData() });
  assert.equal(document.querySelectorAll('tbody tr').length, 25);
  assert.match(document.querySelector('tbody a').href, /\/explorer\/address\/key0$/);
  const firstState = window.history.state;
  document.querySelector('[data-holders-page="2"]').click();
  assert.equal(requests[1].data.page, 2);
  assert.equal(requests[1].data.snapshot_id, firstState.snapshotId);
  requests[1].callback({ success: true, data: await pageData(2) });
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.equal(document.querySelector('tbody td').textContent, '26');
  assert.equal(window.location.search, '?page=2');
  mod.bindNavigation();
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: firstState }));
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(requests[2].data.page, 1);
  assert.equal(requests[2].data.snapshot_id, firstState.snapshotId);
  requests[2].callback({ success: true, data: await pageData() });
  await mod.onPeerServiceUp(app, { publicKey: 'replacement' }, { service: 'Explorer' });
  assert.equal(requests[3].peer, 'replacement');
  assert.equal(requests[3].data.snapshot_id, null);
  requests[3].callback({ success: true, data: await pageData() });
});

test('ignores late responses after leaving the page and normalizes invalid URL pages', async (t) => {
  const { mod, requests } = setup(t, '/explorer/holders?page=-1');
  assert.equal(mod.parseRoute().page, 1);
  await mod.renderHolders({ animate: false });
  mod.cleanupListViews();
  mod.activeView = 'home';
  document.querySelector('.explorer-view').innerHTML = 'Home';
  requests[0].callback({ success: true, data: await pageData() });
  assert.equal(document.querySelector('.explorer-view').textContent, 'Home');
});

test('expired snapshots offer refresh, network failures retry, and disconnected views wait', async (t) => {
  const { mod, requests } = setup(t);
  await mod.renderHolders({ page: 2, snapshotId: 'old', animate: false });
  requests[0].callback({ success: false, code: 'SNAPSHOT_EXPIRED', error: 'Refresh snapshot' });
  assert.match(document.querySelector('[role="alert"]').textContent, /Refresh snapshot/);
  assert.equal(document.querySelector('[data-holders-retry]'), null);
  document.querySelector('[data-holders-refresh]').click();
  assert.equal(requests[1].data.page, 1);
  assert.equal(requests[1].data.snapshot_id, null);
  requests[1].callback({ err: 'network error' });
  document.querySelector('[data-holders-retry]').click();
  assert.equal(requests.length, 3);
  requests[2].callback({ success: true, data: await pageData() });
  mod.explorerPeer = null;
  await mod.renderHolders({ animate: false });
  assert.match(document.querySelector('[role="status"]').textContent, /Waiting for Explorer peer/);
  assert.equal(requests.length, 3);
});

test('empty view, escaped peer content, and bounded page buttons render safely', async (t) => {
  const { app } = setup(t);
  const view = await pageData();
  view.rows[0].public_key = '"><img src=x onerror=alert(1)>';
  view.page = 500;
  view.total_pages = 1000;
  document.querySelector('.explorer-view').innerHTML = HoldersTemplate(app, { view });
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelectorAll('[data-holders-page]').length, 9);
  assert.match(document.querySelector('.explorer-address-status').textContent, /locked stake/);
  document.querySelector('.explorer-view').innerHTML = HoldersTemplate(app, {
    view: { ...view, rows: [], total_utxos: 0, total_holders: 0, page: 1, total_pages: 1 }
  });
  assert.match(document.body.textContent, /No unspent UTXOs/);
  assert.equal(document.querySelector('table'), null);
});

test('server dispatch and direct HTTP route expose holders through existing explorer paths', async (t) => {
  const { mod, app } = setup(t);
  mod.getSupplyBalanceSnapshot = async () => ({
    file_name: `1725000000000-123-${HASH}.snap`,
    rows: []
  });
  const result = await handleExplorerRequest(
    app,
    { request: 'request holders', data: { page: 1 } },
    mod
  );
  assert.equal(result.success, true);
  assert.equal(result.data.total_utxos, 0);
  const routes = new Map();
  mod.webServer(
    app,
    { use() {}, get: (path, handler) => routes.set(path, handler) },
    { static() {} }
  );
  assert.equal(typeof routes.get('/explorer/holders'), 'function');
});
