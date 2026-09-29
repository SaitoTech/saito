const assert = require('node:assert/strict');
const test = require('node:test');

process.env.TS_NODE_PROJECT ||= 'config/build/tsconfig.json';
require('ts-node/register/transpile-only');

const SaitoBlockchain = require('saito-js/lib/blockchain').default;
const Blockchain = require('../../../lib/saito/blockchain').default;

test('Blockchain.getBlock delegates ID and hash lookups to the parent API', async (t) => {
  const calls = [];
  const expectedBlock = { id: 42 };
  const originalGetBlock = SaitoBlockchain.prototype.getBlock;
  SaitoBlockchain.prototype.getBlock = async function (...args) {
    calls.push(args);
    return expectedBlock;
  };
  t.after(() => {
    SaitoBlockchain.prototype.getBlock = originalGetBlock;
  });

  const blockchain = Object.create(Blockchain.prototype);
  const hash = 'a'.repeat(64);

  assert.equal(await blockchain.getBlock(42, true), expectedBlock);
  assert.equal(await blockchain.getBlock(hash), expectedBlock);
  assert.deepEqual(calls, [
    [42, true],
    [hash, false]
  ]);
});
