/** @jest-environment jsdom */
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => class {});
const Admin = require('../../../mods/admin/admin');
const Peers = require('../../../mods/admin/lib/ui/peers');

test('raw snapshot preserves map IDs, duplicate identities, unverified entries and large integers behind authorization', async () => {
  const admin = Object.create(Admin.prototype);
  const get = jest.fn(() => ({ peers: new Map([
    [7n, { id: 7n, public_key: 'same', is_verified: true }],
    [8n, { id: 8n, public_key: 'same', is_verified: false,
      last_activity_at: 9007199254740993n, handshake_nonce: new Uint8Array([1, 2]) }]
  ]) }));
  admin.publicKey = 'server';
  admin.app = { BROWSER: 0, options: { admin: ['admin'] }, core: { network: { peers: { get } } } };
  admin.adminRequestSigner = () => 'admin';
  const tx = { isTo: () => true, returnMessage: () => ({ request: 'get-peer-diagnostics' }) };
  const callback = jest.fn();
  await admin.handlePeerTransaction(admin.app, tx, null, callback);
  expect(JSON.parse(callback.mock.calls[0][0].result)).toEqual({ peers: [
    ['7', { id: '7', public_key: 'same', is_verified: true }],
    ['8', { id: '8', public_key: 'same', is_verified: false,
      last_activity_at: '9007199254740993', handshake_nonce: [1, 2] }]
  ] });
  admin.adminRequestSigner = () => 'outsider';
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await admin.handlePeerTransaction(admin.app, tx, null, callback);
  expect(callback).toHaveBeenLastCalledWith({ err: 'Unauthorized access' });
  expect(get).toHaveBeenCalledTimes(1);
  log.mockRestore();

  admin.adminRequestSigner = () => 'admin';
  get.mockImplementation(() => { throw new Error('Snapshot unavailable'); });
  await admin.handlePeerTransaction(admin.app, tx, null, callback);
  expect(callback).toHaveBeenLastCalledWith({ err: 'Snapshot unavailable' });
});

describe('diagnostics disclosure', () => {
  let ui, callbacks, transactions;
  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = [];
    transactions = [];
    document.body.innerHTML = '<div class="admin-peers"></div>';
    ui = new Peers({
      browser: { replaceElementContentBySelector: (html, selector) => {
        document.querySelector(selector).innerHTML = html;
      } },
      wallet: { createUnsignedTransactionWithDefaultFee: async () => ({ sign: jest.fn(async () => {}) }) },
      network: { sendTransactionWithCallback: async (tx, callback, publicKey) => {
        transactions.push({ tx, publicKey });
        callbacks.push(callback);
      } }
    }, { server_publickey: 'managed-server', server_info: { options: {} } });
    ui.refresh();
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  async function open() {
    const details = document.querySelector('details');
    details.open = true;
    details.ontoggle();
    await Promise.resolve();
    await Promise.resolve();
  }

  test('starts collapsed, fetches on expansion, escapes raw content, and refreshes without collapsing', async () => {
    expect(document.querySelector('details').open).toBe(false);
    expect(transactions).toHaveLength(0);
    await open();
    expect(transactions[0].tx.msg.request).toBe('get-peer-diagnostics');
    expect(transactions[0].tx.sign).toHaveBeenCalled();
    expect(transactions[0].publicKey).toBe('managed-server');
    const json = '{"host":"<img src=x onerror=alert(1)>"}';
    callbacks[0]({ result: json });
    expect(document.querySelector('details pre').textContent).toBe(json);
    expect(document.querySelector('details img')).toBeNull();
    expect(document.querySelector('details').open).toBe(true);
    document.querySelector('details button').click();
    await Promise.resolve();
    await Promise.resolve();
    callbacks[1]({ result: '{"peers":[]}' });
    expect(document.querySelector('details pre').textContent).toBe('{"peers":[]}');
  });

  test('timeout allows retry and ignores late responses', async () => {
    await open();
    jest.advanceTimersByTime(15000);
    expect(document.querySelector('details [role=status]').textContent).toContain('retry');
    expect(document.querySelector('details button').disabled).toBe(false);
    callbacks[0]({ result: 'stale' });
    expect(document.querySelector('details pre').textContent).toBe('');
    await ui.loadDiagnostics();
    callbacks[1]({ err: 'Snapshot unavailable' });
    expect(document.querySelector('details [role=status]').textContent).toBe('Snapshot unavailable');
  });
});
