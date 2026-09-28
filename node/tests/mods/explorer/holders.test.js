const assert = require('node:assert/strict');
const test = require('node:test');
const {
  aggregateHolders,
  getHoldersPage,
  invalidateHolderSnapshots
} = require('../../../mods/explorer/lib/holders');
const { handleRequestHolders } = require('../../../mods/explorer/lib/peer/holders');

const HASH = 'a'.repeat(64);
const snapshot = (rows = [], block = 123) => ({
  file_name: `1725000000000-${block}-${HASH}.snap`,
  rows
});
const row = (key, amount, type = 0) => `${key} 123 0 0 ${amount} ${type}`;

test('aggregates authoritative snapshot rows, retains locked stake, and ranks exact balances with stable ties', () => {
  const result = aggregateHolders(
    snapshot([
      row('keyB', '9007199254740993'),
      row('keyA', '9007199254740993'),
      row('keyC', '9007199254740994'),
      row('stakeHolder', 100, 8),
      row('stakeHolder', 20)
    ])
  );
  assert.equal(result.total_utxos, 5);
  assert.equal(result.total_holders, 4);
  assert.deepEqual(
    result.rows.map((r) => r.public_key),
    ['keyC', 'keyA', 'keyB', 'stakeHolder']
  );
  assert.deepEqual(result.rows[3], {
    public_key: 'stakeHolder',
    balance: '120',
    utxo_count: 2,
    rank: 4
  });
  assert.equal(
    result.rows.reduce((sum, r) => sum + r.utxo_count, 0),
    result.total_utxos
  );
  assert.equal(result.block_id, '123');
  assert.equal(result.block_hash, HASH);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('fails rather than presenting partial totals for unavailable or malformed snapshots', () => {
  for (const bad of [
    null,
    { rows: [] },
    snapshot(['bad']),
    snapshot([row('key', '1.5')]),
    snapshot([row('key', '-1')])
  ]) {
    assert.throws(() => aggregateHolders(bad), /snapshot/i);
  }
});

test('paginates 0, 25 and 26 holders and clamps past the final page', async () => {
  for (const size of [0, 25, 26]) {
    const mod = {
      getSupplyBalanceSnapshot: async () =>
        snapshot(Array.from({ length: size }, (_, i) => row(`key${i}`, i + 1)))
    };
    const first = await getHoldersPage(mod);
    const last = await getHoldersPage(mod, { page: 999, snapshot_id: first.snapshot_id });
    assert.equal(first.rows.length, Math.min(size, 25));
    assert.equal(first.page_size, 25);
    assert.equal(first.total_pages, size === 26 ? 2 : 1);
    assert.equal(last.page, first.total_pages);
    assert.equal(last.rows.length, size === 26 ? 1 : size);
    if (size === 26) {
      assert.equal(last.rows[0].rank, 26);
      assert.equal(new Set([...first.rows, ...last.rows].map((r) => r.public_key)).size, 26);
    }
  }
});

test('validates pagination before reading the snapshot', async () => {
  const mod = {
    getSupplyBalanceSnapshot: () => {
      throw new Error('should not read');
    }
  };
  for (const page of [0, -1, 1.5, '', 'abc', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getHoldersPage(mod, { page }), /positive integer/);
  }
  await assert.rejects(getHoldersPage(mod, { snapshot_id: {} }), /Invalid snapshot/);
});

test('concurrent requests share a build and reuse the cached snapshot', async () => {
  let reads = 0;
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const mod = {
    getSupplyBalanceSnapshot: () => {
      reads++;
      return pending;
    }
  };
  const requests = [getHoldersPage(mod), getHoldersPage(mod)];
  assert.equal(reads, 1);
  resolve(snapshot([row('key', 1)]));
  const [first, second] = await Promise.all(requests);
  assert.deepEqual(first, second);
  await getHoldersPage(mod);
  assert.equal(reads, 1);
});

test('pagination stays pinned across refreshes, expires, and bounds retained snapshots', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  let reads = 0;
  const mod = { getSupplyBalanceSnapshot: async () => snapshot([row('key', ++reads)], reads) };
  const first = await getHoldersPage(mod);
  now += 30_001;
  const second = await getHoldersPage(mod);
  assert.equal(second.rows[0].balance, '2');
  assert.equal(
    (await getHoldersPage(mod, { snapshot_id: first.snapshot_id })).rows[0].balance,
    '1'
  );
  for (let i = 0; i < 2; i++) {
    now += 30_001;
    await getHoldersPage(mod);
  }
  await assert.rejects(getHoldersPage(mod, { snapshot_id: first.snapshot_id }), {
    code: 'SNAPSHOT_EXPIRED'
  });
  now += 5 * 60_000;
  await assert.rejects(getHoldersPage(mod, { snapshot_id: second.snapshot_id }), {
    code: 'SNAPSHOT_EXPIRED'
  });
});

test('reorganizations invalidate cached and in-flight snapshots and permit rebuilding', async () => {
  const mod = { getSupplyBalanceSnapshot: async () => snapshot([row('key', 1)]) };
  const first = await getHoldersPage(mod);
  invalidateHolderSnapshots(mod);
  await assert.rejects(getHoldersPage(mod, { snapshot_id: first.snapshot_id }), {
    code: 'SNAPSHOT_EXPIRED'
  });
  const pending = getHoldersPage(mod);
  invalidateHolderSnapshots(mod);
  await assert.rejects(pending, { code: 'SNAPSHOT_EXPIRED' });
  assert.equal((await getHoldersPage(mod)).total_utxos, 1);
});

test('peer handler returns bounded JSON responses and actionable failures', async () => {
  const mod = { getSupplyBalanceSnapshot: async () => snapshot([row('key', 1)]) };
  const response = await handleRequestHolders({}, mod, { data: { page: 1 } });
  assert.equal(response.success, true);
  assert.equal(response.data.total_holders, 1);
  const expired = await handleRequestHolders({}, mod, { data: { snapshot_id: 'old' } });
  assert.equal(expired.success, false);
  assert.equal(expired.code, 'SNAPSHOT_EXPIRED');
  assert.equal((await handleRequestHolders({}, {}, {})).success, false);
});
