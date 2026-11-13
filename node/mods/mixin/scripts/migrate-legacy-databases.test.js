'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  MigrationError,
  migrateLegacyDatabases,
  loadApplicationCrypto
} = require('./migrate-legacy-databases');

const TRX_ASSET = '25dabac5-056a-48ff-b9f9-f67395dc407c';

function testCrypto() {
  return {
    encryptWithPublicKey(buf, publicKey) {
      return Buffer.from(`enc:${publicKey}:${buf.toString('utf8')}`);
    },
    decryptWithPrivateKey(buf) {
      const text = buf.toString('utf8');
      const jsonAt = text.indexOf('{');
      if (jsonAt < 0) {
        throw new Error('ciphertext is not readable');
      }
      return Buffer.from(text.slice(jsonAt));
    },
    aesDecrypt() {
      return '';
    },
    toBase58(value) {
      return value;
    },
    stringToHex(value) {
      return value;
    }
  };
}

function wallet() {
  return {
    publicKey: 'server-public',
    privateKey: 'a'.repeat(64)
  };
}

function serverCredentials(userId, spend = 'spend-1') {
  return {
    user_id: userId,
    session_id: `session-${userId}`,
    tip_key_base64: 'tip',
    session_seed: 'seed',
    spend_private_key: spend,
    spend_public_key: 'spend-public',
    backed_up: true
  };
}

function encrypt(crypto, publicKey, value) {
  return crypto.encryptWithPublicKey(Buffer.from(JSON.stringify(value), 'utf8'), publicKey).toString('base64');
}

async function temporary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixin-migrate-'));
  const input = path.join(dir, 'old');
  fs.mkdirSync(input);
  const mixin = await open({ filename: path.join(input, 'mixin.sq3'), driver: sqlite3.Database });
  const buysaito = await open({ filename: path.join(input, 'buysaito.sq3'), driver: sqlite3.Database });
  const migration = await open({ filename: path.join(input, 'migration.sq3'), driver: sqlite3.Database });
  await mixin.exec(`CREATE TABLE mixin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publickey TEXT,
    account_hash TEXT
  )`);
  await mixin.exec(`CREATE TABLE mixin_users (
    user_id TEXT,
    address TEXT,
    publickey TEXT,
    asset_id TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`);
  await buysaito.exec(`CREATE TABLE mixin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publickey TEXT,
    mixin_json TEXT
  )`);
  await buysaito.exec(`CREATE TABLE purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT,
    mixin_user_id TEXT,
    destination TEXT,
    status TEXT,
    issue_amount TEXT,
    tx TEXT
  )`);
  await migration.exec(`CREATE TABLE auto_migration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT,
    mixin TEXT,
    status TEXT
  )`);
  await migration.run(
    `INSERT INTO auto_migration (public_key, mixin, status) VALUES (?, ?, ?)`,
    'customer',
    'TAddress|mixin-user|mixin',
    'pending'
  );
  return { dir, input, mixin, buysaito, migration };
}

async function closeAll(fixture) {
  await fixture.mixin.close();
  await fixture.buysaito.close();
  await fixture.migration.close();
}

test('preserves server, alternate, and customer credentials and deposit addresses', async () => {
  const fixture = await temporary();
  const crypto = testCrypto();
  const server = serverCredentials('primary-user');
  const alternate = serverCredentials('alt-user', 'spend-alt');
  const customer = serverCredentials('customer-user', 'spend-customer');
  const serverCipher = encrypt(crypto, 'server-public', server);
  const altCipher = encrypt(crypto, 'server-public', alternate);
  const customerCipher = encrypt(crypto, 'customer-public', customer);
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    'server-public',
    serverCipher
  );
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    'server-public',
    serverCipher
  );
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    'customer-public',
    customerCipher
  );
  await fixture.buysaito.run(
    `INSERT INTO mixin_accounts (publickey, mixin_json) VALUES (?, ?)`,
    'server-public',
    altCipher
  );
  await fixture.mixin.run(
    `INSERT INTO mixin_users (user_id, address, publickey, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    'primary-user',
    'TPrimary',
    'server-public',
    TRX_ASSET,
    10,
    10
  );
  await fixture.buysaito.run(
    `INSERT INTO purchases (ticker, mixin_user_id, destination, status, issue_amount, tx) VALUES (?, ?, ?, ?, ?, ?)`,
    'TRX',
    'alt-user',
    'TAlternate',
    'pending',
    '5',
    'purchase-payload'
  );
  fs.writeFileSync(
    path.join(fixture.input, 'options'),
    JSON.stringify({
      wallet: wallet(),
      mixin: server,
      crypto: { TRX: { address: 'TPrimary' } }
    })
  );
  const output = path.join(fixture.dir, 'mixin.sq3');
  await closeAll(fixture);

  const summary = await migrateLegacyDatabases({
    input: fixture.input,
    output,
    overwrite: false,
    crypto
  });

  assert.equal(summary.validation, 'passed');
  assert.equal(summary.accounts.imported, 3);
  assert.equal(summary.accounts.deduplicated, 2);
  assert.equal(summary.addresses.imported, 2);
  assert.equal(summary.addresses.deduplicated, 1);

  const db = await open({ filename: output, driver: sqlite3.Database });
  const accounts = await db.all(`SELECT publickey, user_id, ciphertext FROM accounts ORDER BY user_id`);
  assert.deepEqual(
    accounts.map((row) => [row.publickey, row.user_id, row.ciphertext]),
    [
      ['customer-public', '', customerCipher],
      ['server-public', 'alt-user', altCipher],
      ['server-public', 'primary-user', serverCipher]
    ]
  );
  const addresses = await db.all(`SELECT mixin_user_id, asset_id, address FROM addresses ORDER BY mixin_user_id`);
  assert.deepEqual(addresses, [
    { mixin_user_id: 'alt-user', asset_id: TRX_ASSET, address: 'TAlternate' },
    { mixin_user_id: 'primary-user', asset_id: TRX_ASSET, address: 'TPrimary' }
  ]);
  const transfers = await db.get(`SELECT COUNT(*) AS count FROM transfers`);
  assert.equal(Number(transfers.count), 0);
  const migrationRows = await db.get(`SELECT COUNT(*) AS count FROM transfers`);
  assert.equal(Number(migrationRows.count), 0);
  await db.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('stops when the same customer key has two different credential backups', async () => {
  const fixture = await temporary();
  const crypto = testCrypto();
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    'customer-public',
    encrypt(crypto, 'customer-public', serverCredentials('one'))
  );
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    'customer-public',
    encrypt(crypto, 'customer-public', serverCredentials('two'))
  );
  fs.writeFileSync(path.join(fixture.input, 'options'), JSON.stringify({ wallet: wallet(), mixin: {} }));
  const output = path.join(fixture.dir, 'mixin.sq3');
  await closeAll(fixture);

  await assert.rejects(
    () => migrateLegacyDatabases({ input: fixture.input, output, overwrite: false, crypto }),
    (err) => err instanceof MigrationError && /conflicting credential records/.test(err.message)
  );
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('stops when one Mixin user has two deposit addresses for the same asset', async () => {
  const fixture = await temporary();
  const crypto = testCrypto();
  const server = serverCredentials('primary-user');
  await fixture.mixin.run(
    `INSERT INTO mixin_users (user_id, address, publickey, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    'primary-user',
    'TOne',
    'server-public',
    TRX_ASSET,
    1,
    1
  );
  await fixture.mixin.run(
    `INSERT INTO mixin_users (user_id, address, publickey, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    'primary-user',
    'TTwo',
    'server-public',
    TRX_ASSET,
    2,
    2
  );
  fs.writeFileSync(
    path.join(fixture.input, 'options'),
    JSON.stringify({ wallet: wallet(), mixin: server })
  );
  const output = path.join(fixture.dir, 'mixin.sq3');
  await closeAll(fixture);

  await assert.rejects(
    () => migrateLegacyDatabases({ input: fixture.input, output, overwrite: false, crypto }),
    (err) => err instanceof MigrationError && /conflicting deposit addresses/.test(err.message)
  );
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('does not replace an existing output unless overwrite is requested', async () => {
  const fixture = await temporary();
  fs.writeFileSync(path.join(fixture.input, 'options'), JSON.stringify({ wallet: wallet(), mixin: {} }));
  const output = path.join(fixture.dir, 'mixin.sq3');
  fs.writeFileSync(output, 'already');
  await closeAll(fixture);

  await assert.rejects(
    () =>
      migrateLegacyDatabases({
        input: fixture.input,
        output,
        overwrite: false,
        crypto: testCrypto()
      }),
    /Output already exists/
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'already');
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('application crypto can decrypt a server credential after migration', async () => {
  const crypto = loadApplicationCrypto();
  const secp256k1 = require('secp256k1');
  const Base58 = require('base-58');
  let privateKey;
  do {
    privateKey = require('node:crypto').randomBytes(32);
  } while (!secp256k1.privateKeyVerify(privateKey));
  const publicKey = Base58.encode(Buffer.from(secp256k1.publicKeyCreate(privateKey, true)));
  const privateHex = privateKey.toString('hex');
  const plain = serverCredentials('real-user', 'ab'.repeat(32));
  const ciphertext = crypto
    .encryptWithPublicKey(Buffer.from(JSON.stringify(plain), 'utf8'), publicKey)
    .toString('base64');

  const fixture = await temporary();
  await fixture.mixin.run(
    `INSERT INTO mixin_accounts (publickey, account_hash) VALUES (?, ?)`,
    publicKey,
    ciphertext
  );
  fs.writeFileSync(
    path.join(fixture.input, 'options'),
    JSON.stringify({
      wallet: { publicKey, privateKey: privateHex },
      mixin: {}
    })
  );
  const output = path.join(fixture.dir, 'mixin.sq3');
  await closeAll(fixture);

  await migrateLegacyDatabases({ input: fixture.input, output, overwrite: false, crypto });
  const db = await open({ filename: output, driver: sqlite3.Database });
  const row = await db.get(`SELECT ciphertext, user_id FROM accounts`);
  assert.equal(row.ciphertext, ciphertext);
  assert.equal(row.user_id, 'real-user');
  const decoded = JSON.parse(
    crypto.decryptWithPrivateKey(Buffer.from(row.ciphertext, 'base64'), privateHex).toString('utf8')
  );
  assert.equal(decoded.spend_private_key, plain.spend_private_key);
  assert.equal(decoded.session_seed, plain.session_seed);
  await db.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});
