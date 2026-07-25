/**
 * Net-flow accounting for the Token Supply table.
 *
 * Each block column shows how value moved into the five major header buckets
 * during block production, derived from protocol transitions (not snapshot diffs).
 *
 * Conservation: current + previous + utxo + treasury + graveyard === 0
 */

const NET_FLOW_SECTION_TITLE = 'Net Flow';

const NET_FLOW_ROWS = [
  { key: 'current_unpaid', label: '→ Current Block Unpaid' },
  { key: 'previous_unpaid', label: '→ Previous Block Unpaid' },
  { key: 'utxo', label: '→ UTXO' },
  { key: 'treasury', label: '→ Treasury' },
  { key: 'graveyard', label: '→ Graveyard' }
];

const NET_FLOW_TOTAL_FIELD = { key: 'total', label: 'TOTAL NET FLOW' };

const NET_FLOW_SECTION_ROWS = [...NET_FLOW_ROWS, NET_FLOW_TOTAL_FIELD];

const EMPTY_BLOCK_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function toBigInt(value) {
  if (value === undefined || value === null || value === '') {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch (err) {
    return 0n;
  }
}

function hasGoldenTicket(row) {
  if (!row) {
    return false;
  }
  const value = row.has_golden_ticket;
  return value === true || value === 1 || value === '1';
}

function hasGrandparent(parentRow) {
  const hash = String(parentRow?.previous_block_hash || '').trim();
  return Boolean(hash && hash !== EMPTY_BLOCK_HASH);
}

/**
 * Resolve the previous longest-chain block row via previous_block_hash.
 * Checks the displayed window first, then the Explorer blocks database.
 */
async function resolvePreviousBlockRow(currentRow, hashIndex, mod, toStatsRow) {
  const parentHash = String(currentRow?.previous_block_hash || '').trim();
  if (!parentHash || parentHash === EMPTY_BLOCK_HASH) {
    return null;
  }

  if (hashIndex?.has(parentHash)) {
    return hashIndex.get(parentHash);
  }

  if (!mod?.database?.getStatisticsByBlockHash || typeof toStatsRow !== 'function') {
    return null;
  }

  try {
    const dbRow = await mod.database.getStatisticsByBlockHash(parentHash);
    return dbRow ? toStatsRow(dbRow) : null;
  } catch (err) {
    console.error('Explorer: failed to resolve previous block for supply net flow', err);
    return null;
  }
}

/**
 * Derive per-category net flows for one block from protocol accounting fields.
 */
function computeNetFlowsForBlock(current, parent) {
  if (!current) {
    return null;
  }

  const parentTotalFees = parent ? toBigInt(parent.total_fees) : 0n;
  const hasGt = hasGoldenTicket(current);
  const parentHadGt = hasGoldenTicket(parent);

  // New fees enter the current block pool; parent fee pool clears into payouts or carry.
  let currentUnpaid = toBigInt(current.total_fees) - parentTotalFees;

  let previousUnpaid = 0n;
  if (parent && !hasGt) {
    previousUnpaid += parentTotalFees;
    if (!parentHadGt && hasGrandparent(parent)) {
      previousUnpaid -= toBigInt(parent.previous_block_unpaid);
    }
  }

  const treasury = toBigInt(current.total_payout_treasury) - toBigInt(current.total_payout_atr);
  const graveyard = toBigInt(current.total_payout_graveyard);

  const utxo =
    toBigInt(current.total_payout_routing) +
    toBigInt(current.total_payout_mining) +
    toBigInt(current.total_payout_atr) -
    toBigInt(current.total_fees);

  const total = parent ? currentUnpaid + previousUnpaid + utxo + treasury + graveyard : null;

  return {
    current_unpaid: currentUnpaid,
    previous_unpaid: previousUnpaid,
    utxo,
    treasury,
    graveyard,
    total
  };
}

/**
 * Compute net flows for every displayed block (low block id → high).
 */
async function computeNetFlows(statsRows = [], options = {}) {
  const { mod, toStatsRow } = options;
  const hashIndex = new Map(
    statsRows.filter((row) => row?.block_hash).map((row) => [row.block_hash, row])
  );

  const results = [];

  for (let i = 0; i < statsRows.length; i++) {
    const row = statsRows[i];
    const parent = await resolvePreviousBlockRow(row, hashIndex, mod, toStatsRow);
    const flows = computeNetFlowsForBlock(row, parent);

    results.push({
      block_id: row?.block_id,
      block_hash: row?.block_hash,
      flows
    });
  }

  return results;
}

function formatNetFlowTone(nolanValue, options = {}) {
  const { isTotal = false } = options;

  if (nolanValue === null || nolanValue === undefined) {
    return 'muted';
  }

  if (isTotal && nolanValue !== 0n) {
    return 'error';
  }

  if (nolanValue === 0n) {
    return 'zero';
  }

  if (nolanValue > 0n) {
    return 'positive';
  }

  return 'negative';
}

module.exports = {
  NET_FLOW_SECTION_TITLE,
  NET_FLOW_ROWS,
  NET_FLOW_TOTAL_FIELD,
  NET_FLOW_SECTION_ROWS,
  toBigInt,
  hasGoldenTicket,
  hasGrandparent,
  resolvePreviousBlockRow,
  computeNetFlowsForBlock,
  computeNetFlows,
  formatNetFlowTone
};
