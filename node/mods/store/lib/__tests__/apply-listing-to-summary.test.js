/**
 * Focused regression tests for the list-asset receive summary path.
 * Run: node mods/store/lib/__tests__/apply-listing-to-summary.test.js
 */

const assert = require('assert');
const path = require('path');
const Module = require('module');

const warehouseDir = path.join(__dirname, '..');
const warehousePath = path.join(warehouseDir, 'warehouse.js');

function makeMockDb(initial = {}) {
  const listings = [...(initial.listings || [])];
  const summaries = new Map();
  for (const row of initial.summaries || []) {
    summaries.set(`${row.nft_id}|${Number(row.price)}`, { ...row });
  }

  return {
    listings,
    summaries,
    async insertListingRow(row) {
      if (listings.some((l) => l.signature === row.signature)) {
        throw new Error('UNIQUE constraint failed: listings.signature');
      }
      listings.push({ ...row });
    },
    async returnListingBySignature(signature) {
      return listings.find((l) => l.signature === signature) || null;
    },
    async sumListingQuantityForBucket(nft_id, price) {
      return listings
        .filter(
          (l) =>
            l.nft_id === nft_id &&
            Number(l.price) === Number(price) &&
            Number(l.on_chain ?? 1) === 1 &&
            Number(l.longest_chain_listed ?? 1) === 1 &&
            Number(l.block_id_sold ?? 0) === 0 &&
            Number(l.longest_chain_sold ?? 0) === 0
        )
        .reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    },
    async returnSummaryByBucket(nft_id, price) {
      return summaries.get(`${nft_id}|${Number(price)}`) || null;
    },
    async insertSummary(row) {
      const key = `${row.nft_id}|${Number(row.price)}`;
      if (summaries.has(key)) {
        throw new Error('UNIQUE constraint failed: summary');
      }
      if (row.quantity_available === 0 && !row.title && !row.description) {
        throw new Error('placeholder summary forbidden in first-list path');
      }
      summaries.set(key, { ...row });
    },
    async updateSummaryAvailableByBucket(nft_id, price, available, updated_at) {
      const key = `${nft_id}|${Number(price)}`;
      const row = summaries.get(key);
      if (!row) {
        throw new Error('missing summary for update');
      }
      row.quantity_available = available;
      row.updated_at = updated_at;
    },
    async updateSummaryMetadata(nft_id, price, { title, description }) {
      const key = `${nft_id}|${Number(price)}`;
      const row = summaries.get(key);
      if (!row) {
        throw new Error('missing summary for metadata');
      }
      if (title) {
        row.title = title;
      }
      if (description !== undefined) {
        row.description = description;
      }
    },
    async updateSummaryCategory(nft_id, price, category) {
      const key = `${nft_id}|${Number(price)}`;
      const row = summaries.get(key);
      if (row) {
        row.category = category;
      }
    },
    async deleteSummaryByBucket(nft_id, price) {
      summaries.delete(`${nft_id}|${Number(price)}`);
    },
    async returnActiveListingForBucket() {
      return null;
    },
    async markListingSold(signature) {
      const row = listings.find((l) => l.signature === signature);
      if (row) {
        row.block_id_sold = 1;
        row.longest_chain_sold = 1;
      }
    }
  };
}

function installStubs() {
  const stubs = new Map([
    [
      './summary',
      class Summary {
        constructor(app, mod, data = {}) {
          Object.assign(this, data);
        }
        isActive() {
          return Number(this.quantity_available) > 0;
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
      './database',
      function Database() {
        return {};
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
        STORE_CATEGORIES: { OTHER: 'Other' },
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
  const Warehouse = require(warehousePath);
  Module.prototype.require = original;
  return Warehouse;
}

function createWarehouse(db) {
  const Warehouse = installStubs();
  const app = { BROWSER: false, storage: { saveTransaction: async () => {} } };
  const mod = { store_public_key: 'store', summaries: {}, image_cache: {} };
  const wh = new Warehouse(app, mod);
  wh.db = db;
  return wh;
}

async function testFirstListWritesCompleteSummary() {
  const db = makeMockDb();
  const wh = createWarehouse(db);

  const listing = {
    signature: 'sig1',
    nft_id: 'nft-image-1',
    seller: 'seller',
    category: 'Tokens & NFTs',
    quantity: 1,
    price: 100,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  await wh.addListing(listing);
  const summary = await wh.applyListingToSummary(listing, {
    title: 'Mint Title',
    listing: { title: 'Listing Title', description: 'A fine NFT' }
  });

  assert.strictEqual(summary.title, 'Listing Title');
  assert.strictEqual(summary.description, 'A fine NFT');
  assert.strictEqual(summary.quantity_available, 1);
  assert.strictEqual(summary.nft_id, 'nft-image-1');
  assert.strictEqual(summary.price, 100);

  const row = await db.returnSummaryByBucket('nft-image-1', 100);
  assert.ok(row);
  assert.strictEqual(row.title, 'Listing Title');
  assert.strictEqual(row.quantity_available, 1);
  console.log('PASS testFirstListWritesCompleteSummary');
}

async function testSameBucketAggregatesQuantity() {
  const db = makeMockDb({
    listings: [
      {
        signature: 'sig1',
        nft_id: 'nft-a',
        quantity: 2,
        price: 50,
        on_chain: 1,
        longest_chain_listed: 1,
        block_id_sold: 0,
        longest_chain_sold: 0
      }
    ],
    summaries: [
      {
        nft_id: 'nft-a',
        price: 50,
        category: 'Tokens & NFTs',
        title: 'Existing',
        description: 'Keep me',
        quantity_available: 2,
        updated_at: 1
      }
    ]
  });
  const wh = createWarehouse(db);

  const listing2 = {
    signature: 'sig2',
    nft_id: 'nft-a',
    seller: 'seller',
    category: 'Tokens & NFTs',
    quantity: 3,
    price: 50,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  await wh.addListing(listing2);
  const summary = await wh.applyListingToSummary(listing2, {
    listing: { title: '', description: '' }
  });

  assert.strictEqual(summary.quantity_available, 5);
  assert.strictEqual(summary.title, 'Existing');
  assert.strictEqual(summary.description, 'Keep me');
  console.log('PASS testSameBucketAggregatesQuantity');
}

async function testDifferentPricesAreSeparateBuckets() {
  const db = makeMockDb({
    listings: [
      {
        signature: 'sig1',
        nft_id: 'nft-b',
        quantity: 1,
        price: 10,
        on_chain: 1,
        longest_chain_listed: 1,
        block_id_sold: 0,
        longest_chain_sold: 0
      }
    ],
    summaries: [
      {
        nft_id: 'nft-b',
        price: 10,
        title: 'Cheap',
        description: '',
        category: 'Other',
        quantity_available: 1,
        updated_at: 1
      }
    ]
  });
  const wh = createWarehouse(db);

  const listing = {
    signature: 'sig2',
    nft_id: 'nft-b',
    seller: 'seller',
    category: 'Other',
    quantity: 1,
    price: 99,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  await wh.addListing(listing);
  await wh.applyListingToSummary(listing, {
    listing: { title: 'Expensive', description: 'pricier' }
  });

  const cheap = await db.returnSummaryByBucket('nft-b', 10);
  const pricey = await db.returnSummaryByBucket('nft-b', 99);
  assert.strictEqual(cheap.quantity_available, 1);
  assert.strictEqual(cheap.title, 'Cheap');
  assert.strictEqual(pricey.quantity_available, 1);
  assert.strictEqual(pricey.title, 'Expensive');
  console.log('PASS testDifferentPricesAreSeparateBuckets');
}

async function testAddListingFromTransactionPopulatesImageCache() {
  const db = makeMockDb();
  const wh = createWarehouse(db);

  wh.listingExists = async () => false;
  wh.observeListingFromTransaction = () => ({
    signature: 'list-sig',
    nft_id: 'nft-img',
    seller: 'seller',
    category: 'Tokens & NFTs',
    quantity: 1,
    price: 100000000,
    on_chain: 1,
    longest_chain_listed: 1,
    block_id_sold: 0,
    longest_chain_sold: 0,
    created_at: Date.now(),
    updated_at: Date.now()
  });

  const nft = {
    id: 'nft-img',
    returnImage: () => 'data:image/png;base64,abc'
  };
  const tx = { signature: 'list-sig' };
  const txmsg = {
    access_script: 'script',
    title: 'From Msg',
    listing: { title: 'Listed Image', description: 'desc', price: 1 }
  };

  const listing = await wh.addListingFromTransaction(nft, tx, txmsg, null);
  assert.ok(listing);
  assert.strictEqual(wh.mod.image_cache['nft-img'], 'data:image/png;base64,abc');

  const row = await db.returnSummaryByBucket('nft-img', 100000000);
  assert.strictEqual(row.title, 'Listed Image');
  assert.strictEqual(row.description, 'desc');
  assert.strictEqual(row.quantity_available, 1);
  console.log('PASS testAddListingFromTransactionPopulatesImageCache');
}

async function testRemoveUsesSyncSummaryForBucket() {
  const db = makeMockDb({
    listings: [
      {
        signature: 'sig-rm',
        nft_id: 'nft-rm',
        quantity: 1,
        price: 7,
        on_chain: 1,
        longest_chain_listed: 1,
        block_id_sold: 0,
        longest_chain_sold: 0
      }
    ],
    summaries: [
      {
        nft_id: 'nft-rm',
        price: 7,
        title: 'Gone Soon',
        description: 'x',
        category: 'Other',
        quantity_available: 1,
        updated_at: 1
      }
    ]
  });
  const wh = createWarehouse(db);
  wh.listings['sig-rm'] = db.listings[0];

  await wh.removeListing([db.listings[0]], null, null, { id: 9, hash: 'h' });

  const row = await db.returnSummaryByBucket('nft-rm', 7);
  assert.strictEqual(row.quantity_available, 0);
  assert.strictEqual(row.title, 'Gone Soon');
  console.log('PASS testRemoveUsesSyncSummaryForBucket');
}

async function testEnsureSummaryRemoved() {
  const Warehouse = installStubs();
  assert.strictEqual(typeof Warehouse.prototype.ensureSummaryForListing, 'undefined');
  assert.strictEqual(typeof Warehouse.prototype.applyListingToSummary, 'function');
  assert.strictEqual(typeof Warehouse.prototype.syncSummaryForBucket, 'function');
  console.log('PASS testEnsureSummaryRemoved');
}

async function main() {
  await testEnsureSummaryRemoved();
  await testFirstListWritesCompleteSummary();
  await testSameBucketAggregatesQuantity();
  await testDifferentPricesAreSeparateBuckets();
  await testAddListingFromTransactionPopulatesImageCache();
  await testRemoveUsesSyncSummaryForBucket();
  console.log('All apply-listing-to-summary tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
