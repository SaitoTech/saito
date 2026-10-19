const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildTransactionIndexRows,
  indexConfirmedBlock
} = require('../../../mods/explorer/lib/transaction-index');

function slip(publicKey, amount, type) {
  return { publicKey, amount, type };
}

function nftTuple(owner, quantity = 1) {
  return [
    slip('nft-id', quantity, 9),
    slip(owner, 0, 0),
    slip('nft-id', 0, 9)
  ];
}

test('indexes payments and nft transfers and skips fee-only and message transactions', () => {
  const rows = buildTransactionIndexRows({
    id: 12,
    hash: 'ab'.repeat(32),
    timestamp: 1700000000000,
    transactions: [
      {
        signature: 'payment',
        timestamp: 1700000001000,
        from: [slip('alice', 100, 0)],
        to: [slip('alice', 90, 0), slip('bob', 10, 0)]
      },
      {
        signature: 'fee-only',
        from: [slip('alice', 100, 0)],
        to: [slip('alice', 99, 0)]
      },
      {
        signature: 'message',
        from: [],
        to: []
      },
      {
        signature: 'nft-transfer',
        from: nftTuple('alice'),
        to: nftTuple('bob')
      }
    ]
  });

  assert.deepEqual(
    rows.map((row) => row.signature),
    ['payment', 'nft-transfer']
  );
  assert.equal(rows[0].transaction_id, 0);
  assert.equal(rows[0].lc, 1);
  assert.equal(rows[0].created_at, 1700000001000);
  assert.equal(rows[1].transaction_id, 3);
  assert.equal(rows[1].block_id, 12);
});

test('onConfirmation indexes a block once and prunes later without waiting', async () => {
  const inserted = [];
  let pruneStarted = false;
  const explorer = {
    PRUNE_EVERY_N_BLOCKS: 100,
    indexedTransactionBlocks: new Set(),
    database: {
      insertTransactionRows: async (rows) => {
        assert.equal(pruneStarted, false);
        inserted.push(rows);
        return { inserted: rows.length, skipped: 0 };
      }
    },
    pruneDatabase: async () => {
      pruneStarted = true;
    }
  };

  const block = {
    id: 100,
    hash: 'cd'.repeat(32),
    timestamp: 1800000000000,
    transactions: [
      {
        signature: 'payment',
        from: [slip('alice', 5, 0)],
        to: [slip('bob', 5, 0)]
      },
      {
        signature: 'noise',
        from: [],
        to: []
      }
    ]
  };

  await indexConfirmedBlock(explorer, block);
  await indexConfirmedBlock(explorer, block);

  assert.equal(inserted.length, 1);
  assert.deepEqual(
    inserted[0].map((row) => row.signature),
    ['payment']
  );
  assert.equal(pruneStarted, false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pruneStarted, true);
});
