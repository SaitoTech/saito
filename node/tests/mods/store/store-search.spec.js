const sqlite3 = require('sqlite3');
const StoreDatabase = require('../../../mods/store/lib/database');

const SELLER = 'seller-public-key';
const OTHER = 'other-public-key';

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

function databaseFor(sqlite) {
  return new StoreDatabase(
    {
      storage: {
        returnDatabaseByName: async () => sqlite,
        queryDatabase: (sql, params) => sqlite.all(sql, params),
        runDatabase: (sql, params) => sqlite.run(sql, params)
      }
    },
    { dbname: 'store' }
  );
}

async function schema(sqlite) {
  await sqlite.exec(`
    CREATE TABLE listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT NOT NULL,
      nft_id TEXT NOT NULL,
      seller TEXT DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      block_hash_listed TEXT NOT NULL DEFAULT '',
      longest_chain_listed INTEGER NOT NULL DEFAULT 1,
      settlement_pending INTEGER NOT NULL DEFAULT 0,
      on_chain INTEGER NOT NULL DEFAULT 1,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE listing_sales (
      signature TEXT NOT NULL,
      block_hash_listed TEXT NOT NULL DEFAULT '',
      longest_chain_sold INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE summary (
      nft_id TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT ''
    );
  `);
}

async function listing(sqlite, row) {
  await sqlite.run(
    `INSERT INTO listings (
      signature, nft_id, seller, price, approved, block_hash_listed,
      longest_chain_listed, on_chain, settlement_pending, created_at
    ) VALUES (
      $signature, $nft_id, $seller, $price, $approved, $block_hash,
      $listed, $on_chain, $pending, $created_at
    )`,
    {
      $signature: row.signature,
      $nft_id: row.nft_id,
      $seller: row.seller,
      $price: row.price == null ? 1 : row.price,
      $approved: row.approved == null ? 1 : row.approved,
      $block_hash: row.block_hash || row.signature,
      $listed: row.listed == null ? 1 : row.listed,
      $on_chain: row.on_chain == null ? 1 : row.on_chain,
      $pending: row.pending == null ? 0 : row.pending,
      $created_at: row.created_at || 1
    }
  );
}

async function summary(sqlite, row) {
  await sqlite.run(
    `INSERT INTO summary (nft_id, price, title, description) VALUES ($nft_id, $price, $title, $description)`,
    {
      $nft_id: row.nft_id,
      $price: row.price == null ? 1 : row.price,
      $title: row.title || '',
      $description: row.description || ''
    }
  );
}

function nft(seed) {
  return String(seed).padStart(66, 'a');
}

describe('store search', () => {
  let sqlite;
  let db;

  beforeEach(async () => {
    sqlite = openMemory();
    await schema(sqlite);
    db = databaseFor(sqlite);
  });

  afterEach(() => sqlite.close());

  test('matches titles and descriptions without regard to case', async () => {
    await listing(sqlite, { signature: 'title-hit', nft_id: nft(1), seller: SELLER, created_at: 2 });
    await summary(sqlite, { nft_id: nft(1), title: 'Canvas Print', description: '' });
    await listing(sqlite, { signature: 'desc-hit', nft_id: nft(2), seller: SELLER, created_at: 1 });
    await summary(sqlite, { nft_id: nft(2), title: 'Other', description: 'A canvas study' });
    await listing(sqlite, { signature: 'miss', nft_id: nft(3), seller: SELLER });
    await summary(sqlite, { nft_id: nft(3), title: 'Poster', description: 'Paper' });

    const found = await db.search({ search_term: 'CANVAS', public_key: SELLER });
    expect(found.total).toBe(2);
    expect(found.signatures).toEqual(['title-hit', 'desc-hit']);
    expect(found.offset).toBe(0);
  });

  test('treats percent, underscore, and backslash as literal characters', async () => {
    await listing(sqlite, { signature: 'percent', nft_id: nft(1), seller: SELLER, created_at: 3 });
    await summary(sqlite, { nft_id: nft(1), title: '100% cotton' });
    await listing(sqlite, { signature: 'percent-miss', nft_id: nft(2), seller: SELLER, created_at: 2 });
    await summary(sqlite, { nft_id: nft(2), title: '100X cotton' });
    await listing(sqlite, { signature: 'underscore', nft_id: nft(3), seller: SELLER, created_at: 1 });
    await summary(sqlite, { nft_id: nft(3), title: 'a_b' });
    await listing(sqlite, { signature: 'underscore-miss', nft_id: nft(4), seller: SELLER });
    await summary(sqlite, { nft_id: nft(4), title: 'axb' });
    await listing(sqlite, { signature: 'slash', nft_id: nft(5), seller: SELLER });
    await summary(sqlite, { nft_id: nft(5), title: 'a\\b' });

    expect((await db.search({ search_term: '100%', public_key: SELLER })).signatures).toEqual(['percent']);
    expect((await db.search({ search_term: 'a_b', public_key: SELLER })).signatures).toEqual(['underscore']);
    expect((await db.search({ search_term: 'a\\b', public_key: SELLER })).signatures).toEqual(['slash']);
  });

  test('a seller search includes that seller only, approved or not', async () => {
    await listing(sqlite, { signature: 'own-pending', nft_id: nft(1), seller: SELLER, approved: 0 });
    await summary(sqlite, { nft_id: nft(1), title: 'Studio lamp' });
    await listing(sqlite, { signature: 'other', nft_id: nft(2), seller: OTHER, approved: 1 });
    await summary(sqlite, { nft_id: nft(2), title: 'Studio lamp' });

    const found = await db.search({ search_term: 'lamp', public_key: SELLER, whitelist_sellers: [SELLER] });
    expect(found.signatures).toEqual(['own-pending']);
  });

  test('an empty public key searches the main store', async () => {
    await listing(sqlite, { signature: 'approved', nft_id: nft(1), seller: SELLER, approved: 1, created_at: 3 });
    await summary(sqlite, { nft_id: nft(1), title: 'Market bowl' });
    await listing(sqlite, { signature: 'listed-seller', nft_id: nft(2), seller: OTHER, approved: 0, created_at: 2 });
    await summary(sqlite, { nft_id: nft(2), title: 'Market bowl' });
    await listing(sqlite, { signature: 'hidden', nft_id: nft(3), seller: SELLER, approved: 0, created_at: 1 });
    await summary(sqlite, { nft_id: nft(3), title: 'Market bowl' });

    const found = await db.search({
      search_term: 'bowl',
      whitelist_sellers: [OTHER]
    });
    expect(found.signatures).toEqual(['approved', 'listed-seller']);
    expect(found.total).toBe(2);
  });

  test('sold, unavailable, and summary-less listings are excluded', async () => {
    await listing(sqlite, { signature: 'sold', nft_id: nft(1), seller: SELLER, created_at: 4 });
    await summary(sqlite, { nft_id: nft(1), title: 'Vase' });
    await sqlite.run(
      `INSERT INTO listing_sales (signature, block_hash_listed, longest_chain_sold) VALUES ('sold', 'sold', 1)`
    );
    await listing(sqlite, { signature: 'off-chain', nft_id: nft(2), seller: SELLER, on_chain: 0, created_at: 3 });
    await summary(sqlite, { nft_id: nft(2), title: 'Vase' });
    await listing(sqlite, {
      signature: 'reserved',
      nft_id: nft(3),
      seller: SELLER,
      pending: 1,
      created_at: 2
    });
    await summary(sqlite, { nft_id: nft(3), title: 'Vase' });
    await listing(sqlite, { signature: 'no-summary', nft_id: nft(4), seller: SELLER, created_at: 1 });
    await listing(sqlite, { signature: 'live', nft_id: nft(5), seller: SELLER, created_at: 5 });
    await summary(sqlite, { nft_id: nft(5), description: 'A vase' });

    const found = await db.search({ search_term: 'vase', public_key: SELLER });
    expect(found.signatures).toEqual(['live']);
    expect(found.total).toBe(1);
  });

  test('pages 24 signatures and keeps the full total', async () => {
    for (let index = 0; index < 25; index += 1) {
      const id = nft(index + 10);
      await listing(sqlite, {
        signature: `page-${String(index).padStart(2, '0')}`,
        nft_id: id,
        seller: SELLER,
        created_at: index + 1
      });
      await summary(sqlite, { nft_id: id, title: 'Page item' });
    }

    const first = await db.search({ search_term: 'page', public_key: SELLER, offset: -4 });
    expect(first.offset).toBe(0);
    expect(first.total).toBe(25);
    expect(first.signatures).toHaveLength(24);
    expect(first.signatures[0]).toBe('page-24');

    const second = await db.search({ search_term: 'page', public_key: SELLER, offset: 24 });
    expect(second.offset).toBe(24);
    expect(second.total).toBe(25);
    expect(second.signatures).toEqual(['page-00']);
  });

  test('a blank term does not search', async () => {
    await listing(sqlite, { signature: 'kept', nft_id: nft(1), seller: SELLER });
    await summary(sqlite, { nft_id: nft(1), title: 'Kept' });
    expect(await db.search({ search_term: '   ', public_key: SELLER })).toEqual({
      signatures: [],
      total: 0,
      offset: 0
    });
    expect(await db.search({})).toEqual({ signatures: [], total: 0, offset: 0 });
  });
});
