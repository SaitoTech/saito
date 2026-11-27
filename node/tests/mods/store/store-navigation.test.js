const assert = require('node:assert/strict');
const test = require('node:test');
const sqlite3 = require('sqlite3');
const secp256k1 = require('secp256k1');
const base58 = require('base-58');
const wasm = require('saito-wasm/pkg/node');
const StoreDatabase = require('../../../mods/store/lib/database');
const {
  receiveModifyStoreNavigation,
  receiveModifyStoreFeatured
} = require('../../../mods/store/lib/navigation');

const NFT_A = 'a'.repeat(66);

function openMemory() {
  const sqlite = new sqlite3.Database(':memory:');
  const bind = (sql, params = {}) => {
    const bound = {};
    for (const key of Object.keys(params || {})) {
      if (sql.includes(key)) {
        bound[key] = params[key];
      }
    }
    return bound;
  };
  const run = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.run(sql, bind(sql, params), function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes });
      });
    });
  const exec = (sql) =>
    new Promise((resolve, reject) => {
      sqlite.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  const all = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.all(sql, bind(sql, params), (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  return { run, exec, all, close: () => sqlite.close() };
}

function identity(byte) {
  const privateKey = Buffer.alloc(32, byte);
  return { privateKey, publicKey: base58.encode(secp256k1.publicKeyCreate(privateKey)) };
}

function signedTx(who, data) {
  const raw = new wasm.WasmTransaction();
  const from = new wasm.WasmSlip();
  from.public_key = who.publicKey;
  raw.add_from_slip(from);
  const to = new wasm.WasmSlip();
  to.public_key = who.publicKey;
  raw.add_to_slip(to);
  const tx = {
    raw,
    app: { crypto: { fromBase58: (key) => Buffer.from(base58.decode(key)).toString('hex') } },
    from: [{ publicKey: who.publicKey }],
    msg: { request: 'store-modify-navigation', data },
    returnMessage() {
      return this.msg;
    },
    isFrom: (key) => key === who.publicKey,
    generateHashForSignature: () => raw.generate_hash_for_signature(),
    getHashForSignature: () => raw.get_hash_for_signature(),
    async sign() {
      raw.data = Buffer.from(JSON.stringify(this.msg));
      raw.generate_hash_for_signature();
      this.signature = secp256k1
        .sign(Buffer.from(raw.get_hash_for_signature()), who.privateKey)
        .signature.toString('hex');
    }
  };
  return tx;
}

test('signed store navigation and featured updates use the verified sender', async () => {
  const sqlite = openMemory();
  await sqlite.exec(`
    CREATE TABLE listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT, nft_id TEXT, seller TEXT, category TEXT, market_category TEXT DEFAULT '',
      price INTEGER, approved INTEGER, block_hash_listed TEXT, longest_chain_listed INTEGER,
      on_chain INTEGER, settlement_pending INTEGER, created_at INTEGER
    );
    CREATE TABLE listing_sales (
      signature TEXT, block_hash_listed TEXT, longest_chain_sold INTEGER
    );
    CREATE TABLE store_categories (
      store_key TEXT NOT NULL, category_id TEXT NOT NULL, name TEXT NOT NULL,
      sort_order INTEGER NOT NULL, listing_order TEXT NOT NULL DEFAULT 'newest',
      visible INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (store_key, category_id)
    );
    CREATE TABLE store_featured (
      store_key TEXT NOT NULL, nft_id TEXT NOT NULL, sort_order INTEGER NOT NULL,
      PRIMARY KEY (store_key, nft_id)
    );
  `);
  const db = new StoreDatabase(
    {
      storage: {
        returnDatabaseByName: async () => sqlite,
        queryDatabase: (sql, params) => sqlite.all(sql, params),
        runDatabase: (sql, params) => sqlite.run(sql, params)
      }
    },
    { dbname: 'store' }
  );
  const seller = identity(4);
  const admin = identity(9);
  const outsider = identity(2);
  const mod = {
    app: {
      crypto: {
        fromBase58: (key) => Buffer.from(base58.decode(key)).toString('hex')
      }
    },
    warehouse: { db },
    isStoreAdmin: (tx) => tx.isFrom(admin.publicKey),
    returnMarketplaceWhitelist: () => []
  };

  const personal = signedTx(admin, {
    module: 'Store',
    categories: [{ category_id: 'studio', name: 'Studio', listing_order: 'newest' }]
  });
  await personal.sign();
  await receiveModifyStoreNavigation(mod, personal);
  assert.deepEqual(
    (await db.returnStoreCategories(admin.publicKey)).map((row) => row.name),
    ['Studio']
  );
  assert.deepEqual(await db.returnStoreCategories(''), []);

  const main = signedTx(admin, {
    module: 'Store',
    scope: 'main',
    categories: [{ category_id: 'apps-and-games', name: 'Apps & Games', listing_order: 'newest' }]
  });
  await main.sign();
  await receiveModifyStoreNavigation(mod, main);
  assert.deepEqual(
    (await db.returnStoreCategories('')).map((row) => row.category_id),
    ['apps-and-games']
  );
  assert.deepEqual(await db.returnFeaturedConfig(''), { name: 'Featured', visible: 1 });

  await db.replaceStoreFeatured('', ['aa'.repeat(33)]);
  const hidden = signedTx(admin, {
    module: 'Store',
    scope: 'main',
    featured_name: 'Front Page',
    featured_visible: 0,
    categories: [{ category_id: 'apps-and-games', name: 'Apps & Games', listing_order: 'newest' }]
  });
  await hidden.sign();
  await receiveModifyStoreNavigation(mod, hidden);
  assert.deepEqual(await db.returnFeaturedConfig(''), { name: 'Front Page', visible: 0 });
  assert.deepEqual(await db.returnFeaturedNftIds(''), ['aa'.repeat(33)]);
  assert.deepEqual(
    (await db.returnStoreCategories('')).map((row) => row.category_id),
    ['apps-and-games']
  );

  const denied = signedTx(outsider, {
    module: 'Store',
    scope: 'main',
    categories: [{ category_id: 'hacked', name: 'Hacked' }]
  });
  await denied.sign();
  await assert.rejects(() => receiveModifyStoreNavigation(mod, denied), /Unauthorized/);
  assert.deepEqual(
    (await db.returnStoreCategories('')).map((row) => row.category_id),
    ['apps-and-games']
  );

  const forged = signedTx(seller, {
    module: 'Store',
    seller_public_key: admin.publicKey,
    categories: []
  });
  await forged.sign();
  await assert.rejects(() => receiveModifyStoreNavigation(mod, forged), /Owner identity/);

  const missing = signedTx(seller, { module: 'Store', categories: [] });
  await assert.rejects(() => receiveModifyStoreNavigation(mod, missing), /Invalid signature/);
  missing.signature = '00'.repeat(64);
  await assert.rejects(() => receiveModifyStoreNavigation(mod, missing), /Invalid signature/);

  await sqlite.run(
    `INSERT INTO listings (
      signature, nft_id, seller, approved, block_hash_listed, longest_chain_listed,
      on_chain, settlement_pending, created_at, price
    ) VALUES ('owned', $nft, $seller, 1, 'owned', 1, 1, 0, 4, 1)`,
    { $nft: NFT_A, $seller: seller.publicKey }
  );
  const duplicate = signedTx(seller, { module: 'Store', featured: [NFT_A, NFT_A] });
  duplicate.msg.request = 'store-modify-featured';
  await duplicate.sign();
  await assert.rejects(() => receiveModifyStoreFeatured(mod, duplicate), /Duplicate NFT id/);
  assert.deepEqual(await db.returnFeaturedNftIds(seller.publicKey), []);

  const saved = signedTx(seller, { module: 'Store', featured: [NFT_A] });
  saved.msg.request = 'store-modify-featured';
  await saved.sign();
  await receiveModifyStoreFeatured(mod, saved);
  assert.deepEqual(await db.returnFeaturedNftIds(seller.publicKey), [NFT_A]);

  const stolen = signedTx(outsider, { module: 'Store', featured: [NFT_A] });
  stolen.msg.request = 'store-modify-featured';
  await stolen.sign();
  await assert.rejects(
    () => receiveModifyStoreFeatured(mod, stolen),
    /not an active listing/
  );
  assert.deepEqual(await db.returnFeaturedNftIds(outsider.publicKey), []);
  sqlite.close();
});
