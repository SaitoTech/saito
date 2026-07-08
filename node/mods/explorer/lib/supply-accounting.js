const ISSUANCE_TRANSACTION_TYPE = 6;
const NOLAN_PER_SAITO = 100_000_000n;
const DEFAULT_SUPPLY_NOLAN = 7_000_000_000n * NOLAN_PER_SAITO;
const EMPTY_BLOCK_HASH =
	'0000000000000000000000000000000000000000000000000000000000000000';

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
      to: Array.isArray(tx.to) ? tx.to : json.to || [],
    };
  }

  return {
    type: tx.type ?? tx.transaction_type,
    to: Array.isArray(tx.to) ? tx.to : [],
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
    previous_block_unpaid: toBigInt(block?.previousBlockUnpaid),
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
      previous_block_unpaid: buckets.previous_block_unpaid.toString(),
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

  let parentRow = null;
  if (mod?.database?.getStatisticsByBlockHash) {
    parentRow = await mod.database.getStatisticsByBlockHash(parentHash);
  }

  if (!parentRow?.total_supply && mod?.database) {
    try {
      const parentBlock = await app.core.blockchain.getBlock(parentHash, true);
      if (parentBlock) {
        await ensureBlockSupplyIndexed(app, mod, parentBlock);
        parentRow = await mod.database.getStatisticsByBlockHash(parentHash);
      }
    } catch (err) {
      console.error('Explorer: failed to index parent block for supply accounting', err);
    }
  }

  if (parentRow?.total_supply != null && parentRow.total_supply !== '') {
    return toBigInt(parentRow.total_supply);
  }

  // Chain has no indexed genesis yet; fall back to protocol default.
  return DEFAULT_SUPPLY_NOLAN;
}

async function computeSupplyBuckets(app, mod, block) {
  const buckets = readHeaderBuckets(block);
  const totalSupply = await resolveTotalSupply(app, mod, block, buckets);
  const utxo = deriveUtxoFromSupply(totalSupply, buckets, blockIdString(block));

  return {
    utxo,
    total_supply: totalSupply,
    ...buckets,
  };
}

async function buildBlockSupplyStats(app, mod, block) {
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
    graveyard,
  } = block;

  const supply = await computeSupplyBuckets(app, mod, block);

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
  };

  return stats;
}

async function ensureBlockSupplyIndexed(app, mod, block) {
  if (!block?.hash || !mod?.database?.upsertBlockStatistics) {
    return null;
  }

  const stats = await buildBlockSupplyStats(app, mod, block);
  await mod.database.upsertBlockStatistics(stats);
  return stats;
}

async function backfillSupplyStatistics(app, mod) {
  if (!mod?.database || app.BROWSER !== 0) {
    return;
  }

  let latestId = 0;
  try {
    latestId = Number(await app.blockchain.getLatestBlockId());
  } catch (err) {
    console.error('Explorer: supply backfill could not read latest block id', err);
    return;
  }

  if (!Number.isFinite(latestId) || latestId <= 0) {
    return;
  }

  for (let blockId = 1; blockId <= latestId; blockId++) {
    try {
      const block = await app.core.blockchain.getBlock(blockId, true);
      if (!block?.hash) {
        continue;
      }
      await ensureBlockSupplyIndexed(app, mod, block);
    } catch (err) {
      console.error(`Explorer: supply backfill failed for block ${blockId}`, err);
    }
  }
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
  isGenesisBlock,
  toStorage,
};
