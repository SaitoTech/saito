const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_SUPPLY_NOLAN,
  backfillSupplyStatistics,
  computeSupplyBuckets,
  ensureBlockSupplyIndexed
} = require('../../../mods/explorer/lib/supply-accounting');

function hashForId(id) {
  return Number(id).toString(16).padStart(64, '0');
}

function blockForId(id) {
  return {
    id,
    hash: hashForId(id),
    previousBlockHash: id > 1 ? hashForId(id - 1) : '0'.repeat(64),
    transactions: []
  };
}

test('backfill uses canonical hashes and only scans retained, incomplete blocks', async () => {
  const rows = new Map([[hashForId(8), { total_supply: DEFAULT_SUPPLY_NOLAN.toString() }]]);
  const hashLookups = [];
  const blockLookups = [];
  const app = {
    BROWSER: 0,
    options: {
      consensus: { genesis_period: 3 },
      blockchain: { lowest_acceptable_block_id: 1 }
    },
    blockchain: {
      getLatestBlockId: async () => 10n,
      getLongestChainHashAtId: async (id) => {
        hashLookups.push(id);
        return hashForId(id);
      }
    },
    core: {
      blockchain: {
        getBlock: async (hash, includeTransactions) => {
          blockLookups.push([hash, includeTransactions]);
          return blockForId(parseInt(hash, 16));
        }
      }
    }
  };
  const mod = {
    database: {
      getStatisticsByBlockHash: async (hash) => rows.get(hash) || null,
      upsertBlockStatistics: async (stats) => {
        rows.set(stats.block_hash, stats);
        return { success: true };
      }
    }
  };

  const summary = await backfillSupplyStatistics(app, mod);

  assert.deepEqual(hashLookups, [8n, 9n, 10n]);
  assert.deepEqual(blockLookups, [
    [hashForId(9), true],
    [hashForId(10), true]
  ]);
  assert.deepEqual(summary, {
    scanned: 3,
    indexed: 2,
    already_indexed: 1,
    unavailable: 0,
    failed: 0
  });
});

test('missing parent statistics do not recursively load the parent block', async () => {
  let blockLoads = 0;
  const app = {
    core: {
      blockchain: {
        getBlock: async () => {
          blockLoads++;
          return blockForId(4);
        }
      }
    }
  };
  const mod = {
    database: {
      getStatisticsByBlockHash: async () => null
    }
  };

  const buckets = await computeSupplyBuckets(app, mod, blockForId(5));

  assert.equal(blockLoads, 0);
  assert.equal(buckets.total_supply, DEFAULT_SUPPLY_NOLAN);
});

test('failed statistic writes reject instead of triggering more parent work', async () => {
  const app = {};
  const mod = {
    database: {
      getStatisticsByBlockHash: async () => null,
      upsertBlockStatistics: async () => ({ success: false, reason: 'database locked' })
    }
  };

  await assert.rejects(
    ensureBlockSupplyIndexed(app, mod, blockForId(1)),
    (err) => err.code === 'EXPLORER_SUPPLY_WRITE_FAILED' && /database locked/.test(err.message)
  );
});

test('concurrent backfill requests share one active run', async () => {
  let resolveLatest;
  let latestCalls = 0;
  const latest = new Promise((resolve) => {
    resolveLatest = resolve;
  });
  const app = {
    BROWSER: 0,
    blockchain: {
      getLatestBlockId: async () => {
        latestCalls++;
        return latest;
      }
    }
  };
  const mod = { database: {} };

  const first = backfillSupplyStatistics(app, mod);
  const second = backfillSupplyStatistics(app, mod);

  assert.equal(first, second);
  resolveLatest(0n);
  await Promise.all([first, second]);
  assert.equal(latestCalls, 1);
});
