const assert = require('node:assert/strict');
const test = require('node:test');

const { classifySearchQuery } = require('../../../mods/explorer/lib/search-nav');
const {
  describeTransactionLookup,
  normalizeTransactionSignature
} = require('../../../mods/explorer/lib/transaction-lookup');

const SIGNATURE = 'ab'.repeat(64);

test('a 64-byte hex signature is a transaction search', () => {
  assert.equal(normalizeTransactionSignature(SIGNATURE.toUpperCase()), SIGNATURE);
  assert.equal(normalizeTransactionSignature('abc'), '');
  assert.deepEqual(classifySearchQuery(null, SIGNATURE), {
    type: 'transaction',
    value: SIGNATURE
  });
});

test('mempool hits are unconfirmed and indexed hits carry the block', () => {
  assert.equal(describeTransactionLookup(SIGNATURE, { signature: SIGNATURE }, null).status, 'UNCONFIRMED');

  const confirmed = describeTransactionLookup(SIGNATURE, null, {
    block_id: 12,
    block_hash: 'cd'.repeat(32),
    transaction_id: 3,
    lc: 1,
    created_at: 1700000000000
  });
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.block_id, '12');
  assert.equal(confirmed.block_hash, 'cd'.repeat(32));
  assert.equal(confirmed.transaction_id, '3');
  assert.equal(confirmed.lc, 1);

  const offChain = describeTransactionLookup(SIGNATURE, null, {
    block_id: 9,
    block_hash: 'ef'.repeat(32),
    transaction_id: 1,
    lc: 0
  });
  assert.equal(offChain.status, 'NOT ON LONGEST CHAIN');
  assert.equal(describeTransactionLookup(SIGNATURE, null, null).status, 'NOT FOUND');
});
