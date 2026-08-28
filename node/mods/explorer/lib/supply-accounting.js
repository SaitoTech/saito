const ISSUANCE_TRANSACTION_TYPE = 6;
const NOLAN_PER_SAITO = 100_000_000n;
const DEFAULT_SUPPLY_NOLAN = 7_000_000_000n * NOLAN_PER_SAITO;
const EMPTY_BLOCK_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const MAX_CONSECUTIVE_BACKFILL_FAILURES = 5;
const activeSupplyBackfills = new WeakMap();

const { returnGenesisPeriod } = require('./address-index');

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

function toStorage(value) {
  if (value === undefined || value === null) {
    return '0';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return String(value);
}

function toNullableStorage(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return toStorage(value);
}

function slipAmountValue(slip) {
  if (slip == null) {
    return 0n;
  }
  try {
    return BigInt(slip.amount ?? 0);
  } catch (err) {
    return 0n;
  }
}

function normalizeTransaction(tx) {
  if (!tx) {
    return null;
  }

  if (typeof tx.toJson === 'function') {
    let json = {};
    try {
      json = JSON.parse(tx.toJson());
    } catch (err) {
      json = {};
    }

    return {
      type: tx.type ?? tx.transaction_type ?? json.type ?? json.transaction_type,
      to: Array.isArray(tx.to) ? tx.to : json.to || []
    };
  }

  return {
    type: tx.type ?? tx.transaction_type,
    to: Array.isArray(tx.to) ? tx.to : []
  };
}

function isIssuanceTransaction(tx) {
  if (!tx) {
    return false;
  }
  const type = tx.type ?? tx.transaction_type;
  return Number(type) === ISSUANCE_TRANSACTION_TYPE || type === 'Issuance';
}

function isGenesisBlock(block) {
  const blockId = Number(block?.id ?? 0);
  if (blockId === 1) {
    return true;
  }

  const previousHash = String(block?.previousBlockHash || '').trim();
  return !previousHash || previousHash === EMPTY_BLOCK_HASH;
}

function sumIssuanceFromBlock(block) {
  let total = 0n;
  const txs = block?.transactions || [];

  for (let i = 0; i < txs.length; i++) {
    const tx = normalizeTransaction(txs[i]);
    if (!tx || !isIssuanceTransaction(tx)) {
      continue;
    }

    const outputs = tx.to || [];
    for (let j = 0; j < outputs.length; j++) {
      total += slipAmountValue(outputs[j]);
    }
  }

  return total;
}

function readHeaderBuckets(block) {
  return {
    treasury: toBigInt(block?.treasury),
    graveyard: toBigInt(block?.graveyard),
    total_fees: toBigInt(block?.totalFees),
    previous_block_unpaid: toBigInt(block?.previousBlockUnpaid)
  };
}

function deriveUtxoFromSupply(totalSupply, buckets, blockId = '') {
  const utxo =
    totalSupply -
    buckets.treasury -
    buckets.graveyard -
    buckets.total_fees -
    buckets.previous_block_unpaid;

  if (utxo < 0n) {
    console.warn('Explorer: negative derived UTXO for supply accounting', {
      block_id: blockId,
      total_supply: totalSupply.toString(),
      treasury: buckets.treasury.toString(),
      graveyard: buckets.graveyard.toString(),
      total_fees: buckets.total_fees.toString(),
      previous_block_unpaid: buckets.previous_block_unpaid.toString()
    });
  }

  return utxo < 0n ? 0n : utxo;
}

function blockIdString(block) {
  if (block?.id == null) {
    return '';
  }
  return String(block.id);
}

function balanceSnapshotTip(fileName) {
  const match = String(fileName || '').match(/^(\d+)-(\d+)-([0-9a-f]{64})\.snap$/i);
  if (!match) {
    return null;
  }

  return {
    block_id: match[2],
    block_hash: match[3].toLowerCase()
  };
}

function sumBalanceSnapshotRows(rows) {
  if (!rows || typeof rows[Symbol.iterator] !== 'function') {
    throw new Error('balance snapshot has no iterable rows');
  }

  let total = 0n;
  for (const row of rows) {
    const columns = String(row || '')
      .trim()
      .split(/\s+/);

    if (columns.length !== 6 || !/^\d+$/.test(columns[4])) {
      throw new Error('balance snapshot contains an invalid row');
    }

    total += BigInt(columns[4]);
  }

  return total;
}

async function readBalanceSnapshotSupply(mod, block, buckets) {
  if (typeof mod?.getSupplyBalanceSnapshot !== 'function') {
    return null;
  }

  try {
    const snapshot = await mod.getSupplyBalanceSnapshot();
    const tip = balanceSnapshotTip(snapshot?.file_name);
    if (!tip) {
      return null;
    }

    if (
      blockIdString(block) !== tip.block_id ||
      String(block?.hash || '').toLowerCase() !== tip.block_hash
    ) {
      return null;
    }

    const calculatedTotalSupply = sumBalanceSnapshotRows(snapshot.rows);
    return {
      calculated_total_supply: calculatedTotalSupply,
      utxo_graveyard_treasury_total: calculatedTotalSupply + buckets.graveyard + buckets.treasury
    };
  } catch (err) {
    console.warn('Explorer: failed to read balance snapshot for supply accounting', err);
    return null;
  }
}

async function resolveGenesisTotalSupply(block) {
  const issuanceTotal = sumIssuanceFromBlock(block);
  if (issuanceTotal > 0n) {
    return issuanceTotal;
  }

  return DEFAULT_SUPPLY_NOLAN;
}

async function resolveTotalSupply(app, mod, block, buckets) {
  if (isGenesisBlock(block)) {
    return resolveGenesisTotalSupply(block);
  }

  const parentHash = String(block?.previousBlockHash || '').trim();
  if (!parentHash || parentHash === EMPTY_BLOCK_HASH) {
    return resolveGenesisTotalSupply(block);
  }

  const parentRow = mod?.database?.getStatisticsByBlockHash
    ? await mod.database.getStatisticsByBlockHash(parentHash)
    : null;

  if (parentRow?.total_supply != null && parentRow.total_supply !== '') {
    return toBigInt(parentRow.total_supply);
  }

  // Chain has no indexed genesis yet; fall back to protocol default.
  return DEFAULT_SUPPLY_NOLAN;
}

async function computeSupplyBuckets(app, mod, block, options = {}) {
  const buckets = readHeaderBuckets(block);
  const totalSupply = await resolveTotalSupply(app, mod, block, buckets);
  const utxo = deriveUtxoFromSupply(totalSupply, buckets, blockIdString(block));
  const consensusSupply =
    options.calculateSnapshot === false
      ? null
      : await readBalanceSnapshotSupply(mod, block, buckets);

  return {
    utxo,
    total_supply: totalSupply,
    calculated_total_supply: consensusSupply?.calculated_total_supply ?? null,
    utxo_graveyard_treasury_total: consensusSupply?.utxo_graveyard_treasury_total ?? null,
    ...buckets
  };
}

async function buildBlockSupplyStats(app, mod, block, options = {}) {
  const {
    id,
    hash,
    totalFees,
    totalFeesNew,
    totalFeesAtr,
    totalFeesCumulative,
    avgTotalFees,
    avgTotalFeesNew,
    avgTotalFeesAtr,
    totalPayoutRouting,
    totalPayoutMining,
    totalPayoutTreasury,
    totalPayoutGraveyard,
    totalPayoutAtr,
    avgPayoutRouting,
    avgPayoutMining,
    avgPayoutTreasury,
    avgPayoutGraveyard,
    avgPayoutAtr,
    avgFeePerByte,
    feePerByte,
    avgNolanRebroadcastPerBlock,
    burnFee,
    difficulty,
    previousBlockUnpaid,
    hasGoldenTicket,
    treasury,
    graveyard
  } = block;

  const supply = await computeSupplyBuckets(app, mod, block, options);

  const stats = {
    block_id: toStorage(id),
    block_hash: hash,
    treasury: toStorage(treasury),
    graveyard: toStorage(graveyard),
    total_fees: toStorage(totalFees),
    total_fees_new: toStorage(totalFeesNew),
    total_fees_atr: toStorage(totalFeesAtr),
    total_fees_cumulative: toStorage(totalFeesCumulative),
    avg_total_fees: toStorage(avgTotalFees),
    avg_total_fees_new: toStorage(avgTotalFeesNew),
    avg_total_fees_atr: toStorage(avgTotalFeesAtr),
    total_payout_routing: toStorage(totalPayoutRouting),
    total_payout_mining: toStorage(totalPayoutMining),
    total_payout_treasury: toStorage(totalPayoutTreasury),
    total_payout_graveyard: toStorage(totalPayoutGraveyard),
    total_payout_atr: toStorage(totalPayoutAtr),
    avg_payout_routing: toStorage(avgPayoutRouting),
    avg_payout_mining: toStorage(avgPayoutMining),
    avg_payout_treasury: toStorage(avgPayoutTreasury),
    avg_payout_graveyard: toStorage(avgPayoutGraveyard),
    avg_payout_atr: toStorage(avgPayoutAtr),
    avg_fee_per_byte: toStorage(avgFeePerByte),
    fee_per_byte: toStorage(feePerByte),
    avg_nolan_rebroadcast_per_block: toStorage(avgNolanRebroadcastPerBlock),
    burn_fee: toStorage(burnFee),
    difficulty: toStorage(difficulty),
    previous_block_unpaid: toStorage(previousBlockUnpaid),
    has_golden_ticket: toStorage(hasGoldenTicket),
    utxo: toStorage(supply.utxo),
    total_supply: toStorage(supply.total_supply),
    calculated_total_supply: toNullableStorage(supply.calculated_total_supply),
    utxo_graveyard_treasury_total: toNullableStorage(supply.utxo_graveyard_treasury_total)
  };

  return stats;
}

async function ensureBlockSupplyIndexed(app, mod, block, options = {}) {
  if (!block?.hash || !mod?.database?.upsertBlockStatistics) {
    return null;
  }

  const stats = await buildBlockSupplyStats(app, mod, block, options);
  const result = await mod.database.upsertBlockStatistics(stats);
  if (!result?.success) {
    const reason = result?.reason || 'unknown database error';
    const err = new Error(
      `Explorer: failed to store supply statistics for block ${stats.block_id}: ${reason}`
    );
    err.code = 'EXPLORER_SUPPLY_WRITE_FAILED';
    throw err;
  }
  return stats;
}

function isBlockHash(hash) {
  return typeof hash === 'string' && hash !== EMPTY_BLOCK_HASH && /^[0-9a-f]{64}$/i.test(hash);
}

function hasSupplyStatistics(row) {
  return row?.total_supply != null && row.total_supply !== '';
}

function hasCalculatedSupply(row) {
  return row?.calculated_total_supply != null && row.calculated_total_supply !== '';
}

function backfillStartId(app, latestId) {
  const genesisPeriod = Math.max(1, returnGenesisPeriod(app));
  const genesisFloor = Math.max(1, latestId - genesisPeriod + 1);
  const savedLowest = Number(app?.options?.blockchain?.lowest_acceptable_block_id);
  const savedFloor = Number.isFinite(savedLowest) && savedLowest > 0 ? Math.floor(savedLowest) : 1;

  return Math.max(1, genesisFloor, savedFloor);
}

async function runSupplyStatisticsBackfill(app, mod) {
  const summary = {
    scanned: 0,
    indexed: 0,
    already_indexed: 0,
    unavailable: 0,
    failed: 0
  };

  if (!mod?.database || app.BROWSER !== 0) {
    return summary;
  }

  let latestId = 0;
  try {
    latestId = Number(await app.blockchain.getLatestBlockId());
  } catch (err) {
    console.error('Explorer: supply backfill could not read latest block id', err);
    return summary;
  }

  if (!Number.isFinite(latestId) || latestId <= 0) {
    return summary;
  }

  const firstBlockId = backfillStartId(app, latestId);
  let consecutiveFailures = 0;

  for (let blockId = firstBlockId; blockId <= latestId; blockId++) {
    summary.scanned++;

    try {
      const blockHash = await app.blockchain.getLongestChainHashAtId(BigInt(blockId));
      if (!isBlockHash(blockHash)) {
        summary.unavailable++;
        consecutiveFailures = 0;
        continue;
      }

      const existing = await mod.database.getStatisticsByBlockHash(blockHash);
      const needsLatestConsensusSnapshot =
        blockId === latestId && typeof mod?.getSupplyBalanceSnapshot === 'function';
      if (
        hasSupplyStatistics(existing) &&
        (!needsLatestConsensusSnapshot || hasCalculatedSupply(existing))
      ) {
        summary.already_indexed++;
        consecutiveFailures = 0;
        continue;
      }

      // Resolve the canonical hash first so older hash-only wrappers also remain safe.
      const block = await app.core.blockchain.getBlock(blockHash, true);
      if (!block?.hash) {
        summary.unavailable++;
        consecutiveFailures = 0;
        continue;
      }

      await ensureBlockSupplyIndexed(app, mod, block, {
        calculateSnapshot: blockId === latestId
      });
      summary.indexed++;
      consecutiveFailures = 0;
    } catch (err) {
      if (err?.code === 'EXPLORER_SUPPLY_WRITE_FAILED') {
        throw err;
      }

      summary.failed++;
      consecutiveFailures++;
      if (consecutiveFailures === 1) {
        console.error(`Explorer: supply backfill failed for block ${blockId}`, err);
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_BACKFILL_FAILURES) {
        throw new Error(
          `Explorer: aborting supply backfill after ${consecutiveFailures} consecutive failures ` +
            `(last block ${blockId})`
        );
      }
    }
  }

  if (summary.failed > 0) {
    console.warn('Explorer: supply backfill completed with recoverable failures', summary);
  }

  return summary;
}

function backfillSupplyStatistics(app, mod) {
  if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) {
    return Promise.resolve();
  }

  const activeBackfill = activeSupplyBackfills.get(mod);
  if (activeBackfill) {
    return activeBackfill;
  }

  const backfill = runSupplyStatisticsBackfill(app, mod).finally(() => {
    if (activeSupplyBackfills.get(mod) === backfill) {
      activeSupplyBackfills.delete(mod);
    }
  });

  activeSupplyBackfills.set(mod, backfill);
  return backfill;
}

module.exports = {
  DEFAULT_SUPPLY_NOLAN,
  NOLAN_PER_SAITO,
  ISSUANCE_TRANSACTION_TYPE,
  buildBlockSupplyStats,
  computeSupplyBuckets,
  ensureBlockSupplyIndexed,
  backfillSupplyStatistics,
  sumIssuanceFromBlock,
  sumBalanceSnapshotRows,
  balanceSnapshotTip,
  isGenesisBlock,
  toStorage
};
