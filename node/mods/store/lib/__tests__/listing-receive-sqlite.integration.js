/**
 * Integration-style test using sqlite3 against a temp copy of store.sq3 schema.
 * Run: node mods/store/lib/__tests__/listing-receive-sqlite.integration.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sqlite3 = require('sqlite3').verbose();

const warehouseDir = path.join(__dirname, '..');
const warehousePath = path.join(warehouseDir, 'warehouse.js');
const databasePath = path.join(warehouseDir, 'database.js');

function openDb(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve(db)));
  });
}

function run(db, sql, params = {}) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes, lastID: this.lastID });
      }
    });
  });
}

function all(db, sql, params = {}) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function installStubs() {
  const stubs = new Map([
    [
      './summary',
      class Summary {
        constructor(app, mod, data = {}) {
          Object.assign(this, data);
        }
      }
    ],
    [
      './listing',
      class Listing {
        constructor(row = {}) {
          Object.assign(this, row);
        }
        isSoldOnChain() {
          return Number(this.block_id_sold) > 0 && Number(this.longest_chain_sold) === 1;
        }
      }
    ],
    [
      './ui/summary-cache',
      {
        syncSummaryCache() {},
        summaryBucketKey(nft_id, price) {
          return `${nft_id}|${Number(price)}`;
        }
      }
    ],
    [
      './order',
      Object.assign(
        class Order {
          constructor(row = {}) {
            Object.assign(this, row);
          }
        },
        {
          ORDER_STATUS_PENDING: 'pending',
          ORDER_STATUS_SETTLING: 'settling',
          ORDER_STATUS_FULFILLED: 'fulfilled',
          ORDER_STATUS_UNFULFILLABLE: 'unfulfillable'
        }
      )
    ],
    [
      './helpers',
      {
        findInventoryTriple: () => null,
        serializeSlip: () => '',
        normalizeSlipJson: (x) => x,
        listingInputSlipJsonFromRecord: () => null,
        transactionIndexInBlock: () => 0,
        slipPublicKey: () => '',
        returnListingSlipId: () => 0
      }
    ],
    ['./archive', { loadTransactionFromArchive: async () => null }],
    ['./images', { initializeImageCache: async () => {} }],
    [
      './scripting',
      {
        executeListingScript: async () => true,
        returnCreatedNftTuples: () => [],
        returnSpentNftTuples: () => []
      }
    ],
    [
      './categories',
      {
        mapNFTTypeToCategory: () => 'Tokens & NFTs',
        STORE_CATEGORIES: {
          OTHER: 'Other',
          TOKENS_AND_NFTS: 'Tokens & NFTs'
        },
        normalizePage: (n) => n,
        normalizePageSize: (n) => n,
        isStoreCategory: () => true
      }
    ],
    ['../../../lib/saito/slip', { default: class Slip {} }],
    [
      '../../../lib/saito/ui/saito-nft/saito-nft',
      class SaitoNFT {
        returnImage() {
          return this.image || '';
        }
      }
    ]
  ]);

  const original = Module.prototype.require;
  Module.prototype.require = function patchedRequire(id) {
    if (stubs.has(id)) {
      return stubs.get(id);
    }
    return original.apply(this, arguments);
  };

  delete require.cache[warehousePath];
  delete require.cache[databasePath];
  // Keep real Database module; Warehouse will construct it then we replace wh.db.
  const Warehouse = require(warehousePath);
  Module.prototype.require = original;
  return Warehouse;
}

async function main() {
  const sqlDir = path.join(warehouseDir, '..', 'sql');
  const schema = [
    fs.readFileSync(path.join(sqlDir, 'listings.sql'), 'utf8'),
    fs.readFileSync(path.join(sqlDir, 'summary.sql'), 'utf8'),
    fs.readFileSync(path.join(sqlDir, 'orders.sql'), 'utf8')
  ].join('\n');
  const tmp = path.join(os.tmpdir(), `store-recv-${Date.now()}.sq3`);
  const sqlite = await openDb(tmp);

  // Execute schema statements
  await new Promise((resolve, reject) => {
    sqlite.exec(schema, (err) => (err ? reject(err) : resolve()));
  });

  const storage = {
    async returnDatabaseByName() {
      return {
        run: (sql, params) => run(sqlite, sql, params)
      };
    },
    async queryDatabase(sql, params) {
      return all(sqlite, sql, params);
    },
    async runDatabase(sql, params) {
      try {
        return await run(sqlite, sql, params);
      } catch (err) {
        // Mirror production swallow
      }
    },
    async saveTransaction() {}
  };

  const Warehouse = installStubs();
  const Database = require(databasePath);
  const app = { BROWSER: false, storage };
  const mod = {
    store_public_key: 'store',
    dbname: 'store',
    summaries: {},
    image_cache: {},
    app
  };
  const wh = new Warehouse(app, mod);
  wh.db = new Database(app, mod);

  wh.listingExists = async () => false;
  wh.observeListingFromTransaction = () => ({
    signature: 'fresh-list-sig',
    nft_id: 'nft-fresh-image',
    seller: 'seller',
    category: 'Tokens & NFTs',
    quantity: 1,
    price: 100000000,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    access_hash: '',
    access_script: '',
    p2sh_address: 'p2sh',
    slip_id: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  });

  const nft = {
    id: 'nft-fresh-image',
    returnImage: () => 'data:image/png;base64,iVBORw0KGgo='
  };
  const tx = { signature: 'fresh-list-sig' };
  const txmsg = {
    access_script: 'ok',
    title: 'Mint Title',
    data: { image: 'data:image/png;base64,iVBORw0KGgo=' },
    listing: { title: 'Listed Title', description: 'Listed Desc', price: 1 }
  };

  const listing = await wh.addListingFromTransaction(nft, tx, txmsg, null);
  assert.ok(listing);

  const summaries = await all(sqlite, 'SELECT * FROM summary');
  assert.strictEqual(summaries.length, 1);
  assert.strictEqual(summaries[0].title, 'Listed Title');
  assert.strictEqual(summaries[0].description, 'Listed Desc');
  assert.strictEqual(summaries[0].quantity_available, 1);
  assert.strictEqual(summaries[0].category, 'Tokens & NFTs');
  assert.strictEqual(summaries[0].image, null);

  const listings = await all(sqlite, 'SELECT * FROM listings');
  assert.strictEqual(listings.length, 1);

  assert.strictEqual(mod.image_cache['nft-fresh-image'], 'data:image/png;base64,iVBORw0KGgo=');

  // Second listing same bucket aggregates
  wh.observeListingFromTransaction = () => ({
    signature: 'fresh-list-sig-2',
    nft_id: 'nft-fresh-image',
    seller: 'seller',
    category: 'Tokens & NFTs',
    quantity: 2,
    price: 100000000,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    access_hash: '',
    access_script: '',
    p2sh_address: 'p2sh',
    slip_id: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  });
  const tx2 = { signature: 'fresh-list-sig-2' };
  await wh.addListingFromTransaction(
    { id: 'nft-fresh-image', returnImage: () => '' },
    tx2,
    { access_script: 'ok', listing: { title: '', description: '' } },
    null
  );

  const after = await all(sqlite, 'SELECT * FROM summary');
  assert.strictEqual(after[0].quantity_available, 3);
  assert.strictEqual(after[0].title, 'Listed Title');

  // Non-image NFT listing
  wh.observeListingFromTransaction = () => ({
    signature: 'text-sig',
    nft_id: 'nft-text',
    seller: 'seller',
    category: 'Other',
    quantity: 1,
    price: 50,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    access_hash: '',
    access_script: '',
    p2sh_address: 'p2sh',
    slip_id: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  });
  await wh.addListingFromTransaction(
    { id: 'nft-text', returnImage: () => '' },
    { signature: 'text-sig' },
    { access_script: 'ok', listing: { title: 'Text NFT', description: 'no image' } },
    null
  );
  assert.strictEqual(mod.image_cache['nft-text'], undefined);
  const textRows = await all(sqlite, `SELECT * FROM summary WHERE nft_id='nft-text'`);
  assert.strictEqual(textRows[0].title, 'Text NFT');
  assert.ok(!mod.image_cache['nft-text']);

  sqlite.close();
  fs.unlinkSync(tmp);
  console.log('PASS listing-receive-sqlite.integration');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
