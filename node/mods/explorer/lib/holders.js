const { balanceSnapshotTip } = require('./supply-accounting');

const PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 30_000;
const SNAPSHOT_TTL_MS = 5 * 60_000;
const MAX_SNAPSHOTS = 3;
const caches = new WeakMap();

function snapshotExpired() {
  const error = new Error(
    'This holder snapshot has expired or the chain changed. Refresh to load the latest holders.'
  );
  error.code = 'SNAPSHOT_EXPIRED';
  return error;
}

// The supply snapshot is authoritative: its rows are unspent, non-Bound
// outputs within the genesis window, including stake that is still locked.
function aggregateHolders(snapshot) {
  const tip = balanceSnapshotTip(snapshot?.file_name);
  const rows = snapshot?.rows;
  if (!tip || !Array.isArray(rows)) {
    throw new Error('Balance snapshot unavailable.');
  }

  const holders = new Map();
  for (const row of rows) {
    const columns = String(row).trim().split(/\s+/);
    if (
      columns.length !== 6 ||
      !columns[0] ||
      !columns.slice(1).every((col) => /^\d+$/.test(col))
    ) {
      throw new Error('Balance snapshot contains an invalid row.');
    }
    const publicKey = columns[0];
    const holder = holders.get(publicKey) || { public_key: publicKey, balance: 0n, utxo_count: 0 };
    holder.balance += BigInt(columns[4]);
    holder.utxo_count++;
    holders.set(publicKey, holder);
  }

  const sorted = [...holders.values()].sort((a, b) => {
    if (a.balance !== b.balance) return a.balance > b.balance ? -1 : 1;
    return a.public_key < b.public_key ? -1 : a.public_key > b.public_key ? 1 : 0;
  });

  return {
    snapshot_id: snapshot.file_name,
    ...tip,
    timestamp: snapshot.file_name.split('-')[0],
    total_utxos: rows.length,
    total_holders: sorted.length,
    rows: sorted.map((holder, index) => ({
      ...holder,
      rank: index + 1,
      balance: holder.balance.toString()
    }))
  };
}

function cacheFor(mod) {
  if (!caches.has(mod)) {
    caches.set(mod, { snapshots: new Map(), pending: null, generation: 0 });
  }
  return caches.get(mod);
}

function invalidateHolderSnapshots(mod) {
  const cache = caches.get(mod);
  if (cache) {
    cache.generation++;
    cache.snapshots.clear();
  }
}

async function getHolderSnapshot(mod, snapshotId) {
  if (typeof mod?.getSupplyBalanceSnapshot !== 'function') {
    throw new Error('Balance snapshot unavailable.');
  }
  const cache = cacheFor(mod);
  const now = Date.now();
  for (const [id, entry] of cache.snapshots) {
    if (now - entry.created >= SNAPSHOT_TTL_MS) cache.snapshots.delete(id);
  }

  if (snapshotId) {
    const entry = cache.snapshots.get(snapshotId);
    if (!entry) throw snapshotExpired();
    return entry.view;
  }

  const latest = [...cache.snapshots.values()].pop();
  if (latest && now - latest.created < REFRESH_INTERVAL_MS) return latest.view;
  if (cache.pending) return cache.pending;

  const generation = cache.generation;
  cache.pending = (async () => {
    const view = aggregateHolders(await mod.getSupplyBalanceSnapshot());
    if (generation !== cache.generation) throw snapshotExpired();
    cache.snapshots.delete(view.snapshot_id);
    cache.snapshots.set(view.snapshot_id, { created: Date.now(), view });
    while (cache.snapshots.size > MAX_SNAPSHOTS) {
      cache.snapshots.delete(cache.snapshots.keys().next().value);
    }
    return view;
  })();

  try {
    return await cache.pending;
  } finally {
    cache.pending = null;
  }
}

async function getHoldersPage(mod, params = {}) {
  const rawPage = params.page ?? 1;
  if (
    !['number', 'string'].includes(typeof rawPage) ||
    !/^[1-9]\d*$/.test(String(rawPage)) ||
    !Number.isSafeInteger(Number(rawPage))
  ) {
    throw new Error('Page must be a positive integer.');
  }
  if (
    params.snapshot_id != null &&
    (typeof params.snapshot_id !== 'string' || params.snapshot_id.length > 150)
  ) {
    throw new Error('Invalid snapshot ID.');
  }
  const view = await getHolderSnapshot(mod, params.snapshot_id);
  const totalPages = Math.max(1, Math.ceil(view.total_holders / PAGE_SIZE));
  const page = Math.min(Number(rawPage), totalPages);
  return {
    ...view,
    page,
    page_size: PAGE_SIZE,
    total_pages: totalPages,
    rows: view.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  };
}

module.exports = { aggregateHolders, getHoldersPage, invalidateHolderSnapshots };
