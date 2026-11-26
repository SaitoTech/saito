const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const StoreDatabase = require('../../../mods/store/lib/database');
const {
  parseStorePath,
  receiveModifyStoreNavigation,
  receiveModifyStoreFeatured,
  validateCategories
} = require('../../../mods/store/lib/navigation');


const NFT_A = 'a'.repeat(66);
const NFT_B = 'b'.repeat(66);
const SELLER = 'seller-public-key';
const OTHER = 'other-public-key';
const ADMIN = 'admin-public-key';

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
        resolve({ changes: this.changes, lastID: this.lastID });
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

function databaseFor(sqlite) {
  const app = {
    storage: {
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params),
      runDatabase: (sql, params) => sqlite.run(sql, params)
    }
  };
  return new StoreDatabase(app, { dbname: 'store' });
}

async function schema(sqlite) {
  await sqlite.exec(`
    CREATE TABLE listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT NOT NULL,
      nft_id TEXT NOT NULL,
      seller TEXT DEFAULT '',
      category TEXT DEFAULT '',
      market_category TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      price INTEGER NOT NULL DEFAULT 0,
      block_hash_listed TEXT NOT NULL DEFAULT '',
      longest_chain_listed INTEGER NOT NULL DEFAULT 1,
      settlement_pending INTEGER NOT NULL DEFAULT 0,
      on_chain INTEGER NOT NULL DEFAULT 1,
      approved INTEGER NOT NULL DEFAULT 0,
      buyer TEXT NOT NULL DEFAULT '',
      sold_at INTEGER NOT NULL DEFAULT 0,
      block_id_sold INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE listing_sales (
      signature TEXT NOT NULL,
      block_hash_listed TEXT NOT NULL DEFAULT '',
      longest_chain_sold INTEGER NOT NULL DEFAULT 0,
      buyer TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE summary (
      nft_id TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE store_categories (
      store_key TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      listing_order TEXT NOT NULL DEFAULT 'newest',
      PRIMARY KEY (store_key, category_id)
    );
    CREATE TABLE store_featured (
      store_key TEXT NOT NULL,
      nft_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (store_key, nft_id)
    );
  `);
}

async function listing(sqlite, row) {
  await sqlite.run(
    `INSERT INTO listings (
      signature, nft_id, seller, category, market_category, price, approved,
      block_hash_listed, longest_chain_listed, on_chain, settlement_pending, created_at
    ) VALUES (
      $signature, $nft_id, $seller, $category, $market_category, $price, $approved,
      $block_hash, $listed, 1, 0, $created_at
    )`,
    {
      $signature: row.signature,
      $nft_id: row.nft_id,
      $seller: row.seller,
      $category: row.category || '',
      $market_category: row.market_category || '',
      $price: row.price || 1,
      $approved: row.approved == null ? 1 : row.approved,
      $block_hash: row.block_hash || row.signature,
      $listed: row.listed == null ? 1 : row.listed,
      $created_at: row.created_at || 1
    }
  );
}

function modFor(db, { admin = false, whitelist = [] } = {}) {
  return {
    warehouse: { db },
    isStoreAdmin(tx) {
      return admin && tx?.from?.[0]?.publicKey === ADMIN;
    },
    returnMarketplaceWhitelist: () => whitelist
  };
}

function unsignedTx(sender, data) {
  return {
    from: [{ publicKey: sender }],
    signature: '',
    returnMessage: () => ({ request: 'store-modify-navigation', data }),
    isFrom: (key) => key === sender
  };
}

describe('store navigation and featured listings', () => {
  let sqlite;
  let db;

  beforeEach(async () => {
    sqlite = openMemory();
    await schema(sqlite);
    db = databaseFor(sqlite);
  });

  afterEach(() => sqlite.close());

  test('routes classify featured, category, signature, and legacy nft ids', () => {
    expect(parseStorePath('store', '/store')).toMatchObject({ featured: true, publicKey: '' });
    expect(parseStorePath('store', '/store/moderate')).toMatchObject({ moderate: true });
    expect(parseStorePath('store', '/store/category/apps-and-games')).toMatchObject({
      category: 'apps-and-games',
      publicKey: ''
    });
    expect(parseStorePath('store', '/store/SELLER')).toMatchObject({
      publicKey: 'SELLER',
      featured: true
    });
    expect(parseStorePath('store', '/store/SELLER/admin')).toMatchObject({
      publicKey: 'SELLER',
      admin: true
    });
    expect(parseStorePath('store', '/store/SELLER/prints')).toMatchObject({
      publicKey: 'SELLER',
      category: 'prints'
    });
    const signature = 'ab'.repeat(64);
    expect(parseStorePath('store', `/store/listing/${signature}`)).toMatchObject({ signature });
    expect(parseStorePath('store', `/store/SELLER/${signature}`)).toMatchObject({
      publicKey: 'SELLER',
      signature
    });
    expect(parseStorePath('store', `/store/SELLER/${NFT_A}`)).toMatchObject({
      publicKey: 'SELLER',
      nft_id: NFT_A
    });
  });

  test('unsigned navigation is rejected before any category write', async () => {
    const mod = modFor(db);
    await receiveModifyStoreNavigation(mod, {
      ...unsignedTx(SELLER, {
        module: 'Store',
        categories: [{ category_id: 'prints', name: 'Prints', listing_order: 'alphabetical' }]
      }),
      signature: '11'.repeat(32),
      generateHashForSignature() {},
      getHashForSignature: () => Buffer.alloc(32),
      app: { crypto: { fromBase58: () => '00'.repeat(33) } }
    }).catch(() => null);

    await expect(
      receiveModifyStoreNavigation(mod, unsignedTx(SELLER, { module: 'Store', categories: [] }))
    ).rejects.toThrow(/signature/i);

    const rowsBefore = await sqlite.all('SELECT * FROM store_categories');
    expect(rowsBefore).toHaveLength(0);

    expect(require('../../../mods/store/lib/navigation').payloadHasOwnerField({ public_key: SELLER })).toBe(
      true
    );
  });

  test('invalid navigation and failed replacement leave the previous categories', async () => {
    await db.replaceStoreCategories(SELLER, [
      { category_id: 'prints', name: 'Prints', sort_order: 0, listing_order: 'newest' }
    ]);
    const mod = modFor(db);
    expect(() => validateCategories([{ category_id: 'Prints', name: 'Prints' }])).toThrow(/invalid/i);
    expect(() =>
      validateCategories([
        { category_id: 'prints', name: 'Prints' },
        { category_id: 'prints', name: 'Again' }
      ])
    ).toThrow(/duplicate category id/i);
    expect(() =>
      validateCategories([
        { category_id: 'prints', name: 'Prints' },
        { category_id: 'posters', name: 'prints' }
      ])
    ).toThrow(/duplicate category name/i);
    expect(() =>
      validateCategories(
        Array.from({ length: 31 }, (_, index) => ({
          category_id: `item-${index}`,
          name: `Cat ${index}`
        }))
      )
    ).toThrow(/30/);

    const originalRun = sqlite.run;
    sqlite.run = (sql, params) => {
      if (String(sql).includes('INSERT INTO store_categories')) {
        return Promise.reject(new Error('insert failed'));
      }
      return originalRun(sql, params);
    };
    await expect(
      db.replaceStoreCategories(SELLER, [
        { category_id: 'posters', name: 'Posters', sort_order: 0, listing_order: 'newest' }
      ])
    ).rejects.toThrow(/insert failed/);
    sqlite.run = originalRun;
    const rows = await db.returnStoreCategories(SELLER);
    expect(rows.map((row) => row.category_id)).toEqual(['prints']);
  });

  test('deleting and recreating a category keeps listing ids and restores the category page', async () => {
    await listing(sqlite, {
      signature: 'sig-1',
      nft_id: NFT_A,
      seller: SELLER,
      category: 'prints',
      created_at: 5
    });
    await db.replaceStoreCategories(SELLER, [
      { category_id: 'prints', name: 'Prints', sort_order: 0, listing_order: 'newest' }
    ]);
    await db.replaceStoreCategories(SELLER, []);
    const stored = await sqlite.all('SELECT category FROM listings');
    expect(stored[0].category).toBe('prints');
    const all = await db.countListingsForSeller({ seller: SELLER, category: '' });
    const filtered = await db.countListingsForSeller({ seller: SELLER, category: 'prints' });
    expect(all).toBe(1);
    expect(filtered).toBe(1);

    await db.replaceStoreCategories(SELLER, [
      { category_id: 'prints', name: 'New Prints', sort_order: 0, listing_order: 'alphabetical' }
    ]);
    const page = await db.returnListingsPageForSeller({
      seller: SELLER,
      category: 'prints',
      order: 'alphabetical'
    });
    expect(page).toHaveLength(1);
    expect(page[0].category).toBe('prints');
    const nav = await db.returnStoreCategory(SELLER, 'prints');
    expect(nav.name).toBe('New Prints');
    expect(nav.category_id).toBe('prints');
  });

  test('featured keeps one newest active listing per nft and survives sale, relist, and reorg flags', async () => {
    await listing(sqlite, {
      signature: 'old',
      nft_id: NFT_A,
      seller: SELLER,
      price: 10,
      created_at: 1
    });
    await listing(sqlite, {
      signature: 'new',
      nft_id: NFT_A,
      seller: SELLER,
      price: 20,
      created_at: 9
    });
    await listing(sqlite, {
      signature: 'other-seller',
      nft_id: NFT_A,
      seller: OTHER,
      price: 5,
      created_at: 20
    });
    await sqlite.run(
      `INSERT INTO summary (nft_id, price, title) VALUES ($nft_id, 20, 'Zebra')`,
      { $nft_id: NFT_A }
    );
    await db.replaceStoreFeatured(SELLER, [NFT_A, NFT_B]);

    let page = await db.returnListingsPageForSeller({ seller: SELLER, featured: true });
    expect(page.map((row) => row.signature)).toEqual(['new']);

    await sqlite.run(
      `INSERT INTO listing_sales (signature, block_hash_listed, longest_chain_sold, buyer)
       VALUES ('old', 'old', 1, 'buyer'), ('new', 'new', 1, 'buyer')`
    );
    page = await db.returnListingsPageForSeller({ seller: SELLER, featured: true });
    expect(page).toHaveLength(0);
    const kept = await db.returnFeaturedNftIds(SELLER);
    expect(kept).toEqual([NFT_A, NFT_B]);

    await listing(sqlite, {
      signature: 'relist',
      nft_id: NFT_A,
      seller: SELLER,
      price: 30,
      created_at: 30
    });
    page = await db.returnListingsPageForSeller({ seller: SELLER, featured: true });
    expect(page.map((row) => row.signature)).toEqual(['relist']);
    expect(await db.returnFeaturedNftIds(SELLER)).toEqual([NFT_A, NFT_B]);

    await sqlite.run(`UPDATE listings SET longest_chain_listed = 0 WHERE signature = 'relist'`);
    page = await db.returnListingsPageForSeller({ seller: SELLER, featured: true });
    expect(page).toHaveLength(0);
    await sqlite.run(`UPDATE listings SET longest_chain_listed = 1 WHERE signature = 'relist'`);
    page = await db.returnListingsPageForSeller({ seller: SELLER, featured: true });
    expect(page.map((row) => row.signature)).toEqual(['relist']);
  });

  test('main featured requires marketplace eligibility and a failed update keeps the previous ids', async () => {
    await listing(sqlite, {
      signature: 'approved',
      nft_id: NFT_A,
      seller: SELLER,
      approved: 1,
      created_at: 2
    });
    await listing(sqlite, {
      signature: 'pending',
      nft_id: NFT_B,
      seller: OTHER,
      approved: 0,
      created_at: 3
    });
    await db.replaceStoreFeatured('', [NFT_A]);
    const visible = await db.returnMarketplaceListingsPage({
      whitelist_sellers: [],
      featured: true
    });
    expect(visible.map((row) => row.signature)).toEqual(['approved']);
    expect(await db.nftHasActiveListing(NFT_A, { marketplace: { whitelist_sellers: [] } })).toBe(true);
    expect(await db.nftHasActiveListing(NFT_B, { marketplace: { whitelist_sellers: [] } })).toBe(false);
    expect(await db.nftHasActiveListing(NFT_A, { seller: SELLER })).toBe(true);
    expect(await db.nftHasActiveListing(NFT_A, { seller: OTHER })).toBe(false);

    const mod = modFor(db, { admin: true });
    await expect(
      receiveModifyStoreFeatured(mod, unsignedTx(ADMIN, { module: 'Store', scope: 'main', featured: [NFT_B] }))
    ).rejects.toThrow(/signature|eligible|unauthorized/i);
    expect(await db.returnFeaturedNftIds('')).toEqual([NFT_A]);
  });

  test('legacy marketplace labels move to market_category once and are not reseeded', async () => {
    await listing(sqlite, {
      signature: 'legacy',
      nft_id: NFT_A,
      seller: SELLER,
      category: 'Image NFTs',
      approved: 1
    });
    await sqlite.run(
      `INSERT INTO summary (nft_id, price, title, category) VALUES ($nft_id, 1, 'Picture', 'Image NFTs')`,
      { $nft_id: NFT_A }
    );
    await db.migrateLegacyMarketplaceCategories();
    const row = (await sqlite.all(`SELECT category, market_category, approved FROM listings`))[0];
    expect(row.category).toBe('');
    expect(row.market_category).toBe('image-nfts');
    expect(row.approved).toBe(1);
    const categories = await db.returnStoreCategories('');
    expect(categories.map((category) => category.category_id)).toContain('apps-and-games');
    expect(categories.map((category) => category.category_id)).toContain('image-nfts');

    await db.replaceStoreCategories('', []);
    await db.migrateLegacyMarketplaceCategories();
    expect(await db.returnStoreCategories('')).toEqual([]);
  });

  test('alphabetical category order uses the summary title and signature tie-break', async () => {
    await listing(sqlite, { signature: 'b', nft_id: NFT_B, seller: SELLER, category: 'prints', created_at: 2 });
    await listing(sqlite, { signature: 'a', nft_id: NFT_A, seller: SELLER, category: 'prints', created_at: 9 });
    await sqlite.run(`INSERT INTO summary (nft_id, price, title) VALUES ($id, 1, 'Same')`, { $id: NFT_A });
    await sqlite.run(`INSERT INTO summary (nft_id, price, title) VALUES ($id, 1, 'Same')`, { $id: NFT_B });
    const page = await db.returnListingsPageForSeller({
      seller: SELLER,
      category: 'prints',
      order: 'alphabetical'
    });
    expect(page.map((row) => row.signature)).toEqual(['a', 'b']);
  });

  test('navigation and featured create functions submit a signed store transaction', () => {
    const calls = [];
    const mod = {
      store_public_key: 'peer',
      app: {
        network: {
          sendRequestAsTransaction: (...args) => {
            calls.push(args);
            return args;
          }
        }
      }
    };
    const transactions = require('../../../mods/store/lib/transactions');
    transactions.createModifyStoreNavigationTransaction.call(
      mod,
      [{ category_id: 'prints', name: 'Prints' }],
      '',
      () => {}
    );
    transactions.createModifyStoreFeaturedListingsTransaction.call(mod, [NFT_A], 'main', () => {});
    expect(calls[0][0]).toBe('store-modify-navigation');
    expect(calls[0][1]).toEqual({
      module: 'Store',
      categories: [{ category_id: 'prints', name: 'Prints' }]
    });
    expect(calls[0][4]).toBe(true);
    expect(calls[1][0]).toBe('store-modify-featured');
    expect(calls[1][1].scope).toBe('main');
    expect(calls[1][4]).toBe(true);
    expect(calls[0][1].public_key).toBeUndefined();
    expect(calls[1][1].store_key).toBeUndefined();
  });
});
