const assert = require('node:assert/strict');
const test = require('node:test');
const ModTemplate = require('../../../lib/templates/modtemplate');

function peer(url, overrides = {}) {
  return {
    host: 'cobb.saito.io',
    port: 443,
    protocol: 'https',
    status: 'connected',
    publicKey: 'cobb-key',
    get: () => ({ url }),
    ...overrides
  };
}

function setup(t, peers, name = 'Stack', origin = 'https://saito.io') {
  const originalWindow = global.window;
  global.window = { location: new URL(origin) };
  t.after(() => {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  });
  // Successful requests should not leave the fallback timer running in these tests.
  t.mock.method(global, 'setTimeout', () => 0);

  const requests = [];
  const mod = new ModTemplate({
    BROWSER: 1,
    network: {
      getPeers: async () => peers,
      sendRequestAsTransaction: (request, data, callback, publicKey) => {
        requests.push({ request, data, publicKey });
        callback({ shortlink: `/${name.toLowerCase()}/s/testcode` });
      }
    }
  });
  mod.name = name;
  mod.shortlinks_enabled = 1;
  return { mod, requests };
}

for (const name of ['Stack', 'Videocall']) {
  test(`${name} shortens through the public connection despite a different advertised endpoint`, async (t) => {
    const { mod, requests } = setup(t, [peer('wss://saito.io/wsopen')], name);
    const longUrl = `https://saito.io/${name.toLowerCase()}/?long=example`;

    assert.equal(
      await mod.createShortLink(longUrl),
      `https://saito.io/${name.toLowerCase()}/s/testcode`
    );
    assert.deepEqual(
      requests.map(({ request, publicKey }) => ({ request, publicKey })),
      [{ request: `${name.toLowerCase()} create shortlink`, publicKey: 'cobb-key' }]
    );
    assert.equal(requests[0].data.link, longUrl);
    await mod.createShortLink(longUrl);
    assert.equal(requests.length, 1, 'successful links remain cached');
  });
}

test('selects the serving connection over another peer advertising the page hostname', async (t) => {
  const { mod, requests } = setup(t, [
    peer('wss://other.example/wsopen', { host: 'saito.io', publicKey: 'other-key' }),
    peer('wss://saito.io:443/wsopen')
  ]);
  await mod.createShortLink('https://saito.io/stack/post');
  assert.equal(requests[0].publicKey, 'cobb-key');
});

test('keeps the long URL when no connected serving peer is available', async (t) => {
  const { mod, requests } = setup(t, [
    peer('wss://other.example/wsopen', { host: 'saito.io' }),
    peer('wss://saito.io:8443/wsopen'),
    peer('wss://saito.io/wsopen', { status: 'disconnected' }),
    peer('wss://saito.io/wsopen', { publicKey: '' }),
    peer('invalid-url', { host: 'saito.io' })
  ]);
  const longUrl = 'https://saito.io/stack/post';
  assert.equal(await mod.createShortLink(longUrl), longUrl);
  assert.equal(requests.length, 0);
});

test('supports peers without connection URL metadata using their advertised endpoint', async (t) => {
  const { mod, requests } = setup(t, [peer(null, { host: 'saito.io', get: undefined })]);
  assert.equal(
    await mod.createShortLink('https://saito.io/stack/post'),
    'https://saito.io/stack/s/testcode'
  );
  assert.equal(requests.length, 1);
});

test('supports HTTP connection default ports and the existing localhost alias', async (t) => {
  const { mod, requests } = setup(t, [peer('ws://127.0.0.1/wsopen')], 'Stack', 'http://localhost');
  assert.equal(
    await mod.createShortLink('http://localhost/stack/post'),
    'http://localhost/stack/s/testcode'
  );
  assert.equal(requests.length, 1);
});

test('supports explicit public ports behind a proxy', async (t) => {
  const { mod, requests } = setup(
    t,
    [peer('wss://saito.io:8443/wsopen')],
    'Stack',
    'https://saito.io:8443'
  );
  assert.equal(
    await mod.createShortLink('https://saito.io:8443/stack/post'),
    'https://saito.io:8443/stack/s/testcode'
  );
  assert.equal(requests.length, 1);
});
