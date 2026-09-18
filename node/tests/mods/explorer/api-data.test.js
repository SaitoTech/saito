const assert = require('node:assert/strict');
const test = require('node:test');

const { buildExplorerApiData } = require('../../../mods/explorer/lib/api-data');

const HASH = 'a'.repeat(64);

function latestBlock(overrides = {}) {
  return {
    id: 123n,
    hash: HASH,
    timestamp: 1_725_000_000_000n,
    creator: 'block-producer-public-key',
    treasury: 700_000_000_000_000_001n,
    graveyard: 22n,
    totalFees: 1_000n,
    previousBlockUnpaid: 2_000n,
    ...overrides
  };
}

test('buildExplorerApiData returns the indexed UTXO snapshot and latest block metadata', async () => {
  const app = {
    core: {
      blockchain: {
        getBlocks: async (count, includeOffchain) => {
          assert.equal(count, 1);
          assert.equal(includeOffchain, false);
          return [latestBlock()];
        }
      }
    }
  };
  const mod = {
    database: {
      getStatisticsByBlockHash: async (hash) => {
        assert.equal(hash, HASH);
        return { calculated_total_supply: '699999999999999977' };
      }
    }
  };

  assert.deepEqual(await buildExplorerApiData(app, mod), {
    supply: {
      utxo_set_value: '699999999999999977',
      treasury: '700000000000000001',
      graveyard: '22',
      total_fees: '1000',
      previous_block_unpaid: '2000'
    },
    blocks: {
      latest_block_id: 123,
      latest_block_hash: HASH,
      latest_block_time: 1_725_000_000_000,
      latest_block_producer: 'block-producer-public-key'
    }
  });
});

test('buildExplorerApiData falls back to a live balance snapshot for an unindexed tip', async () => {
  const block = latestBlock({
    id: 2n,
    previousBlockHash: 'b'.repeat(64),
    treasury: 10n,
    graveyard: 2n,
    totalFees: 3n,
    previousBlockUnpaid: 4n
  });
  const app = {
    core: {
      blockchain: {
        getBlocks: async () => [block]
      }
    }
  };
  const mod = {
    database: {
      getStatisticsByBlockHash: async () => null
    },
    getSupplyBalanceSnapshot: async () => ({
      file_name: `0-2-${HASH}.snap`,
      rows: ['key hash sid block_id 41 0', 'key hash sid block_id 1 0']
    })
  };

  const data = await buildExplorerApiData(app, mod);
  assert.equal(data.supply.utxo_set_value, '42');
  assert.equal(data.supply.total_fees, '3');
  assert.equal(data.supply.previous_block_unpaid, '4');
});

test('buildExplorerApiData rejects when the chain has no latest block', async () => {
  const app = {
    core: {
      blockchain: {
        getBlocks: async () => []
      }
    }
  };

  await assert.rejects(buildExplorerApiData(app, {}), /latest block unavailable/);
});
