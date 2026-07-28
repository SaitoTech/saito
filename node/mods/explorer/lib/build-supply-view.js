const { SUPPLY_BLOCK_COUNT } = require('./supply-rows');
const { formatSupplyTable } = require('./supply-format');
const { buildBlockStatistics } = require('./block-statistics');
const { hasGoldenTicket } = require('./supply-deltas');

function normalizeBlockId(value) {
  if (value == null || value === '') {
    return '—';
  }
  return String(value);
}

function dbRowToStatsRow(dbRow) {
  if (!dbRow) {
    return null;
  }

  return {
    block_id: dbRow.block_id,
    block_hash: dbRow.block_hash,
    previous_block_hash: dbRow.previous_block_hash || null,
    treasury: dbRow.treasury,
    graveyard: dbRow.graveyard,
    previous_block_unpaid: dbRow.previous_block_unpaid,
    total_fees: dbRow.total_fees,
    utxo: dbRow.utxo,
    total_supply: dbRow.total_supply,
    has_golden_ticket: dbRow.has_golden_ticket,
    total_payout_routing: dbRow.total_payout_routing,
    total_payout_mining: dbRow.total_payout_mining,
    total_payout_treasury: dbRow.total_payout_treasury,
    total_payout_graveyard: dbRow.total_payout_graveyard,
    total_payout_atr: dbRow.total_payout_atr,
    total_fees_new: dbRow.total_fees_new,
    total_fees_atr: dbRow.total_fees_atr,
    total_fees_cumulative: dbRow.total_fees_cumulative,
    fee_per_byte: dbRow.fee_per_byte,
    burn_fee: dbRow.burn_fee,
    difficulty: dbRow.difficulty
  };
}

function buildPresentationColumns(statsRows = []) {
  return statsRows.map((row) => ({
    blockId: normalizeBlockId(row.block_id),
    blockHash: String(row.block_hash || ''),
    hasGoldenTicket: hasGoldenTicket(row)
  }));
}

async function resolveStatsForBlock(app, mod, block, dbRow) {
  let row = null;

  if (dbRow) {
    row = dbRowToStatsRow(dbRow);
  } else {
    row = await buildBlockStatistics(app, mod, block);
  }

  if (row && block) {
    row.previous_block_hash = String(block.previousBlockHash || '').trim() || null;
  }

  return row;
}

/**
 * Build a presentation-ready Token Supply accounting view.
 */
async function buildSupplyView(app, mod, requestedCount = SUPPLY_BLOCK_COUNT) {
  const count = Number.isFinite(requestedCount)
    ? Math.min(Math.max(Math.floor(requestedCount), 1), 20)
    : SUPPLY_BLOCK_COUNT;

  if (!mod?.database) {
    throw new Error('explorer database unavailable');
  }

  let chainBlocks = [];
  try {
    chainBlocks = await app.core.blockchain.getBlocks(count, false);
  } catch (err) {
    console.error('Explorer: failed to read longest-chain blocks for supply', err);
    throw new Error('failed to read longest-chain blocks');
  }

  if (!Array.isArray(chainBlocks) || !chainBlocks.length) {
    return {
      count,
      hasData: false,
      columns: [],
      rows: []
    };
  }

  const hashes = chainBlocks.map((block) => block?.hash).filter(Boolean);
  const dbRows = await mod.database.getStatisticsByBlockHashes(hashes);
  const rowMap = new Map(dbRows.map((row) => [row.block_hash, row]));

  const statsRows = [];
  for (let i = 0; i < chainBlocks.length; i++) {
    const block = chainBlocks[i];
    if (!block?.hash) {
      continue;
    }
    statsRows.push(await resolveStatsForBlock(app, mod, block, rowMap.get(block.hash)));
  }

  // getBlocks returns newest-first; display left-to-right as low block id → high.
  statsRows.reverse();

  const columns = buildPresentationColumns(statsRows);
  const rows = await formatSupplyTable(statsRows, { mod, toStatsRow: dbRowToStatsRow });

  return {
    count,
    hasData: columns.length > 0,
    columns,
    rows
  };
}

module.exports = {
  buildSupplyView,
  dbRowToStatsRow
};
