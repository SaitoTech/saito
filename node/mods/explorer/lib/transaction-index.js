const { slipTypeId, slipAmount, nftQuantityFromSlips } = require('./nft-tuples');

const SAITO_SLIP_TYPES = new Set([0, 10]); // Normal, P2SH

function slipPublicKey(slip) {
  return slip?.publicKey || slip?.public_key || '';
}

function saitoByKey(slips) {
  const totals = new Map();
  for (const slip of slips || []) {
    if (!SAITO_SLIP_TYPES.has(slipTypeId(slip))) {
      continue;
    }
    const key = slipPublicKey(slip);
    const amount = slipAmount(slip);
    if (!key || amount <= 0n) {
      continue;
    }
    totals.set(key, (totals.get(key) || 0n) + amount);
  }
  return totals;
}

function movesSaito(tx) {
  const inputs = saitoByKey(tx?.from);
  const outputs = saitoByKey(tx?.to);
  for (const [key, received] of outputs) {
    if (received > (inputs.get(key) || 0n)) {
      return true;
    }
  }
  return false;
}

function movesNft(tx) {
  return nftQuantityFromSlips(tx?.from) > 0n || nftQuantityFromSlips(tx?.to) > 0n;
}

function buildTransactionIndexRows(blk) {
  const transactions = Array.isArray(blk?.transactions) ? blk.transactions : [];
  const blockId = Number(blk?.id);
  const blockHash = String(blk?.hash || '');
  if (!blockHash || !Number.isFinite(blockId) || blockId <= 0) {
    return [];
  }

  const createdAt = Number(blk?.timestamp || Date.now());
  const rows = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const signature = String(tx?.signature || '');
    if (!signature || (!movesSaito(tx) && !movesNft(tx))) {
      continue;
    }
    const txCreatedAt = Number(tx?.timestamp);
    rows.push({
      block_id: blockId,
      block_hash: blockHash,
      lc: 1,
      signature,
      transaction_id: i,
      created_at: Number.isFinite(txCreatedAt) && txCreatedAt > 0 ? txCreatedAt : createdAt
    });
  }

  return rows;
}

const INDEXED_BLOCK_LIMIT = 1024;

async function indexConfirmedBlock(mod, blk) {
  const blockHash = String(blk?.hash || '');
  const blockId = Number(blk?.id);
  if (!blockHash || !Number.isFinite(blockId) || blockId <= 0) {
    return;
  }
  if (mod.indexedTransactionBlocks.has(blockHash)) {
    return;
  }
  mod.indexedTransactionBlocks.add(blockHash);
  if (mod.indexedTransactionBlocks.size > INDEXED_BLOCK_LIMIT) {
    const oldest = mod.indexedTransactionBlocks.values().next().value;
    mod.indexedTransactionBlocks.delete(oldest);
  }

  const interval = Number(mod.PRUNE_EVERY_N_BLOCKS) || 100;
  if (blockId % interval === 0) {
    setImmediate(() => {
      mod.pruneDatabase(blockId).catch((err) => {
        console.error('Explorer: database prune failed', err);
      });
    });
  }

  try {
    const rows = buildTransactionIndexRows(blk);
    await mod.database.insertTransactionRows(rows);
  } catch (err) {
    mod.indexedTransactionBlocks.delete(blockHash);
    console.error('Explorer: failed to index transactions', err);
  }
}

module.exports = {
  buildTransactionIndexRows,
  indexConfirmedBlock,
  movesNft,
  movesSaito
};
