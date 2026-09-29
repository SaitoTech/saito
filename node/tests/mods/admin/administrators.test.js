const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const secp256k1 = require('secp256k1');
const base58 = require('base-58');
const wasm = require('saito-wasm/pkg/node');

process.env.TS_NODE_PROJECT ||= 'config/build/tsconfig.json';
require('ts-node/register/transpile-only');
const Admin = require('../../../mods/admin/admin');
const AdministratorsUI = require('../../../mods/admin/lib/ui/administrators');
const template = require('../../../mods/admin/lib/ui/administrators.template');

const identities = [1, 2, 3, 4, 5].map((n) => {
  const privateKey = Buffer.alloc(32, n);
  return { privateKey, publicKey: base58.encode(secp256k1.publicKeyCreate(privateKey)) };
});
const [alice, bob, carol, dave, server] = identities;
const crypto = {
  fromBase58: (key) => Buffer.from(base58.decode(key)).toString('hex'),
  isPublicKey: (key) => {
    try {
      return secp256k1.publicKeyVerify(Buffer.from(base58.decode(key)));
    } catch (err) {
      return false;
    }
  }
};

// Real WASM transaction serialization/hashing and secp256k1 signatures, with
// only the network/wallet adapter replaced so no running node is required.
function transaction(identity, message) {
  const raw = new wasm.WasmTransaction();
  const from = new wasm.WasmSlip();
  from.public_key = identity.publicKey;
  raw.add_from_slip(from);
  const to = new wasm.WasmSlip();
  to.public_key = server.publicKey;
  raw.add_to_slip(to);
  const tx = {
    raw,
    msg: message,
    from: [{ publicKey: identity.publicKey }],
    isTo: (key) => raw.is_to(key),
    returnMessage: () => JSON.parse(Buffer.from(raw.data).toString()),
    generateHashForSignature: () => raw.generate_hash_for_signature(),
    getHashForSignature: () => raw.get_hash_for_signature(),
    async sign() {
      raw.data = Buffer.from(JSON.stringify(this.msg));
      raw.generate_hash_for_signature();
      this.signature = secp256k1
        .sign(Buffer.from(raw.get_hash_for_signature()), identity.privateKey)
        .signature.toString('hex');
    }
  };
  return tx;
}

function fixture(t, admins = [alice.publicKey, bob.publicKey, carol.publicKey]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saito-admin-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'options');
  const original = JSON.stringify({
    admin: admins,
    label: "Node owner's server",
    wallet: { privateKey: 'encrypted-value' }
  });
  fs.writeFileSync(filename, original, { mode: 0o600 });
  const app = {
    BROWSER: 0,
    options: JSON.parse(original),
    crypto,
    storage: {
      config_dir: dir,
      returnPath: () => path,
      returnFileSystem: () => fs,
      saveOptions: () => {
        throw new Error('Admin changes must use checked persistence');
      }
    }
  };
  const mod = Object.create(Admin.prototype);
  Object.assign(mod, { app, publicKey: server.publicKey });
  mod.getOptions = () => ({ options: app.options });
  return { app, mod, filename, dir, read: () => JSON.parse(fs.readFileSync(filename, 'utf8')) };
}

async function request(mod, identity, operation, key, extra = {}) {
  const tx = transaction(identity, { module: 'Admin', request: operation, key, ...extra });
  await tx.sign();
  let response;
  await mod.handlePeerTransaction(mod.app, tx, null, (res) => {
    response = res;
  });
  assert.ok(response, `No response to ${operation}`);
  return response;
}

test('all listed admins retain ordinary functions and can add administrators', async (t) => {
  const { mod, read } = fixture(t);
  for (const identity of [alice, bob, carol]) {
    assert.ok((await request(mod, identity, 'validate-admin-key')).options);
  }
  const result = await request(mod, bob, 'add-admin', ` ${dave.publicKey} `);
  assert.equal(result.err, undefined);
  assert.deepEqual(
    result.result.admins,
    [alice, bob, carol, dave].map((p) => p.publicKey)
  );
  assert.equal(result.result.permissions.can_promote, false);
  assert.deepEqual(read().admin, result.result.admins);
  assert.ok((await request(mod, dave, 'validate-admin-key')).options);
  mod.executeAdminSql = async () => ({ rows: [{ answer: 42 }] });
  assert.deepEqual(
    (
      await request(mod, bob, 'run-sql-query', undefined, {
        data: { db: 'test', query: 'SELECT 42' }
      })
    ).result.rows,
    [{ answer: 42 }]
  );
});

test('regular admins can remove each other and removed keys immediately lose access', async (t) => {
  const { mod } = fixture(t);
  assert.ok((await request(mod, bob, 'remove-admin', carol.publicKey)).result);
  assert.match((await request(mod, carol, 'validate-admin-key')).err, /Unauthorized/);
  assert.match((await request(mod, carol, 'add-admin', dave.publicKey)).err, /Unauthorized/);
  const selfRemoval = await request(mod, bob, 'remove-admin', bob.publicKey);
  assert.deepEqual(selfRemoval.result.admins, [alice.publicKey]);
  assert.equal(selfRemoval.result.permissions.is_admin, false);
});

test('nobody can remove the primary, including themselves or the sole admin', async (t) => {
  const { mod, read } = fixture(t);
  for (const identity of [alice, bob]) {
    assert.match(
      (await request(mod, identity, 'remove-admin', alice.publicKey)).err,
      /cannot be removed/
    );
  }
  await request(mod, alice, 'remove-admin', bob.publicKey);
  await request(mod, alice, 'remove-admin', carol.publicKey);
  assert.match(
    (await request(mod, alice, 'remove-admin', alice.publicKey)).err,
    /cannot be removed/
  );
  assert.deepEqual(read().admin, [alice.publicKey]);
});

test('promotion transfers protection and authority and preserves remaining order', async (t) => {
  const { mod, read } = fixture(t);
  assert.match((await request(mod, bob, 'promote-admin', bob.publicKey)).err, /Only the primary/);
  const promoted = await request(mod, alice, 'promote-admin', carol.publicKey);
  assert.deepEqual(promoted.result.admins, [carol.publicKey, alice.publicKey, bob.publicKey]);
  assert.equal(promoted.result.permissions.can_promote, false);
  assert.equal((await request(mod, carol, 'list-admins')).result.permissions.can_promote, true);
  assert.match((await request(mod, alice, 'promote-admin', bob.publicKey)).err, /Only the primary/);
  assert.match((await request(mod, bob, 'remove-admin', carol.publicKey)).err, /cannot be removed/);
  assert.ok((await request(mod, bob, 'remove-admin', alice.publicKey)).result);
  assert.deepEqual(read().admin, [carol.publicKey, bob.publicKey]);
});

test('invalid keys, duplicates, unknown targets, and redundant promotions do not change the list', async (t) => {
  const { mod, app, read } = fixture(t);
  const original = [...app.options.admin];
  for (const [operation, key, error] of [
    ['add-admin', '<script>', /valid Saito/],
    ['add-admin', {}, /valid Saito/],
    ['add-admin', undefined, /valid Saito/],
    ['add-admin', bob.publicKey, /already listed/],
    ['remove-admin', dave.publicKey, /not listed/],
    ['promote-admin', dave.publicKey, /not listed/],
    ['promote-admin', alice.publicKey, /already primary/],
    ['set-admin-key', dave.publicKey, /already configured/]
  ]) {
    assert.match((await request(mod, alice, operation, key)).err, error);
  }
  assert.deepEqual(app.options.admin, original);
  assert.deepEqual(read().admin, original);
});

test('only initial registration works without admins, and it only works once', async (t) => {
  const { mod } = fixture(t, []);
  for (const operation of ['list-admins', 'validate-admin-key', 'add-admin', 'update-options']) {
    assert.match((await request(mod, alice, operation, alice.publicKey)).err, /Unauthorized/);
  }
  assert.match((await request(mod, alice, 'set-admin-key', 'invalid')).err, /valid Saito/);
  assert.equal(
    (await request(mod, alice, 'set-admin-key', alice.publicKey)).result.permissions.is_primary,
    true
  );
  assert.match(
    (await request(mod, alice, 'set-admin-key', bob.publicKey)).err,
    /already configured/
  );
  assert.match((await request(mod, bob, 'set-admin-key', bob.publicKey)).err, /Unauthorized/);
});

test('rejects outsiders, forged signatures, extra admin inputs, and tampered messages', async (t) => {
  const { mod } = fixture(t);
  assert.match((await request(mod, dave, 'list-admins')).err, /Unauthorized/);
  for (const [identity, tamper] of [
    [
      alice,
      (tx) => {
        tx.signature = '00'.repeat(64);
      }
    ],
    [
      alice,
      (tx) => {
        tx.raw.data = Buffer.from(
          JSON.stringify({ module: 'Admin', request: 'remove-admin', key: bob.publicKey })
        );
      }
    ],
    [
      dave,
      (tx) => {
        tx.from[0].publicKey = alice.publicKey;
      }
    ],
    [
      dave,
      (tx) => {
        tx.from.push({ publicKey: alice.publicKey });
      }
    ]
  ]) {
    const tx = transaction(identity, {
      module: 'Admin',
      request: 'add-admin',
      key: dave.publicKey
    });
    await tx.sign();
    tamper(tx);
    let response;
    await mod.handlePeerTransaction(mod.app, tx, null, (res) => {
      response = res;
    });
    assert.match(response.err, /Unauthorized/);
  }
});

test('saving preserves other configuration, large integers, file permissions, and restart order', async (t) => {
  const { mod, app, filename } = fixture(t);
  fs.writeFileSync(
    filename,
    fs.readFileSync(filename, 'utf8').replace('"label":', '"large":9007199254740993123,"label":')
  );
  await request(mod, alice, 'promote-admin', bob.publicKey);
  const saved = fs.readFileSync(filename, 'utf8');
  assert.match(saved, /9007199254740993123/);
  assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  assert.equal(JSON.parse(saved).label, "Node owner's server");
  assert.equal(JSON.parse(saved).wallet.privateKey, 'encrypted-value');
  app.options = JSON.parse(saved);
  assert.equal((await request(mod, bob, 'list-admins')).result.permissions.is_primary, true);
  assert.deepEqual(app.options.admin, [bob.publicKey, alice.publicKey, carol.publicKey]);
});

test('failed writes and failed renames leave memory and disk untouched and clean temporary files', async (t) => {
  const { mod, app, filename, dir } = fixture(t);
  const original = fs.readFileSync(filename, 'utf8');
  const admins = [...app.options.admin];
  for (const method of ['writeFileSync', 'renameSync']) {
    app.storage.returnFileSystem = () => ({
      ...fs,
      [method]: () => {
        throw Object.assign(new Error('injected failure'), { code: 'EACCES' });
      }
    });
    assert.match((await request(mod, alice, 'add-admin', dave.publicKey)).err, /not writable/);
    assert.deepEqual(app.options.admin, admins);
    assert.equal(fs.readFileSync(filename, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(dir), ['options']);
  }
  app.storage.returnFileSystem = () => fs;
  assert.ok((await request(mod, alice, 'add-admin', dave.publicKey)).result);
});

test('simultaneous changes use current permissions and cannot overwrite each other', async (t) => {
  const { mod, read } = fixture(t, [alice.publicKey, bob.publicKey]);
  const adds = await Promise.all([
    request(mod, alice, 'add-admin', carol.publicKey),
    request(mod, bob, 'add-admin', dave.publicKey)
  ]);
  assert.ok(adds.every((res) => res.result));
  assert.deepEqual(
    read().admin,
    [alice, bob, carol, dave].map((p) => p.publicKey)
  );
  const transfers = await Promise.all([
    request(mod, alice, 'promote-admin', bob.publicKey),
    request(mod, alice, 'promote-admin', carol.publicKey)
  ]);
  assert.ok(transfers[0].result);
  assert.match(transfers[1].err, /Only the primary/);
  const removals = await Promise.all([
    request(mod, bob, 'remove-admin', alice.publicKey),
    request(mod, alice, 'add-admin', server.publicKey)
  ]);
  assert.ok(removals[0].result);
  assert.match(removals[1].err, /Unauthorized/);
});

test('general options updates retain the explicitly requested admin-list override', async (t) => {
  const { mod, app } = fixture(t);
  app.storage.saveOptions = () => {};
  mod.writeOptions = () => null;
  assert.equal(
    (await request(mod, bob, 'update-options', undefined, { data: { admin: [bob.publicKey] } }))
      .result,
    1
  );
  assert.deepEqual(app.options.admin, [bob.publicKey]);
});

function browserUI(mod, identity) {
  const clientMod = {
    publicKey: identity.publicKey,
    server_publickey: server.publicKey,
    server_info: { options: {} }
  };
  const app = {
    crypto,
    wallet: { createUnsignedTransactionWithDefaultFee: async () => transaction(identity, {}) },
    network: {
      sendTransactionWithCallback(tx, callback) {
        return mod.handlePeerTransaction(mod.app, tx, null, (res) =>
          callback({ returnMessage: () => res })
        );
      }
    }
  };
  const ui = new AdministratorsUI(app, clientMod);
  ui.refresh = () => {
    ui.html = template({ ...ui, publicKey: identity.publicKey });
  };
  return ui;
}

test('two wallet UI flow updates buttons after transfer, removal, and stale-permission rejection', async (t) => {
  const { mod } = fixture(t);
  const previousConfirm = global.sconfirm;
  const confirmations = [];
  global.sconfirm = async (message) => {
    confirmations.push(message);
    return true;
  };
  t.after(() => {
    global.sconfirm = previousConfirm;
  });
  const primary = browserUI(mod, alice);
  const regular = browserUI(mod, bob);
  await primary.load();
  await regular.load();
  assert.match(primary.html, /Make primary/);
  assert.doesNotMatch(regular.html, /Make primary/);
  primary.draft = dave.publicKey;
  await primary.add();
  assert.equal(primary.draft, '');
  assert.ok(primary.admins.includes(dave.publicKey));
  await primary.change('promote-admin', bob.publicKey);
  assert.match(confirmations[0], /You will become a regular administrator/);
  assert.doesNotMatch(primary.html, /Make primary/);
  await regular.load();
  assert.match(regular.html, /Make primary/);
  await regular.change('remove-admin', alice.publicKey);
  await primary.change('add-admin', server.publicKey);
  assert.match(primary.error, /Unauthorized/);
  assert.equal(primary.permissions, null);
  assert.doesNotMatch(primary.html, /Add administrator/);
});

test('UI respects cancelled confirmations, self removal, and invalid key input', async (t) => {
  const { mod } = fixture(t);
  const previousConfirm = global.sconfirm;
  t.after(() => {
    global.sconfirm = previousConfirm;
  });
  const ui = browserUI(mod, bob);
  await ui.load();
  ui.draft = 'invalid';
  await ui.add();
  assert.match(ui.error, /valid Saito/);
  global.sconfirm = async () => false;
  await ui.change('remove-admin', bob.publicKey);
  assert.ok(ui.admins.includes(bob.publicKey));
  assert.equal(ui.busy, false);
  global.sconfirm = async () => true;
  await ui.change('remove-admin', bob.publicKey);
  assert.equal(ui.permissions.is_admin, false);
  assert.match(ui.notice, /no longer have administrator access/);
  assert.doesNotMatch(ui.html, /Add administrator/);
});

test('administrator template escapes input and never offers primary removal', () => {
  const html = template({
    admins: [alice.publicKey, bob.publicKey],
    permissions: { can_add: true, can_remove: true, can_promote: true },
    publicKey: alice.publicKey,
    error: '<script>',
    draft: '" onfocus="alert(1)',
    notice: '',
    busy: false
  });
  assert.doesNotMatch(html, /<script>|value="" onfocus=/);
  assert.doesNotMatch(
    html,
    new RegExp(`data-admin-action="remove-admin" data-key="${alice.publicKey}"`)
  );
  assert.match(html, /Primary admin/);
  assert.match(html, />You</);
});

test('DOM controls submit additions and transfer primary status through signed requests', async (t) => {
  const { JSDOM } = require('jsdom');
  const { mod } = fixture(t);
  const dom = new JSDOM('<div class="admin-administrators"></div>');
  const previousDocument = global.document;
  const previousConfirm = global.sconfirm;
  global.document = dom.window.document;
  global.sconfirm = async () => true;
  t.after(() => {
    global.document = previousDocument;
    global.sconfirm = previousConfirm;
    dom.window.close();
  });
  const ui = browserUI(mod, alice);
  ui.app.browser = {
    replaceElementContentBySelector(html, selector) {
      document.querySelector(selector).innerHTML = html;
    }
  };
  delete ui.refresh;
  await ui.load();
  const input = document.querySelector('#admin-administrator-key');
  input.value = dave.publicKey;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document
    .querySelector('#admin-administrator-add-form')
    .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(setImmediate);
  assert.ok(ui.admins.includes(dave.publicKey));
  assert.equal(document.querySelector('#admin-administrator-key').value, '');
  document
    .querySelector(`[data-admin-action="promote-admin"][data-key="${bob.publicKey}"]`)
    .click();
  await new Promise(setImmediate);
  assert.equal(ui.admins[0], bob.publicKey);
  assert.equal(document.querySelector('[data-admin-action="promote-admin"]'), null);
  assert.equal(
    document.querySelector(`[data-admin-action="remove-admin"][data-key="${bob.publicKey}"]`),
    null
  );
  document.querySelector('#admin-administrators-refresh').click();
  await new Promise(setImmediate);
  assert.equal(ui.busy, false);
  assert.equal(ui.permissions.is_primary, false);
});
