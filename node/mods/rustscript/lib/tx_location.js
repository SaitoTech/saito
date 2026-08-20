/**
 * Canonical UTXO location helpers for RustScript publish / unlock artifacts.
 *
 * Saito utxoset keys include block_id, tx_ordinal, and slip_index. Publish txs
 * start with zeros on outputs; those fields are assigned when the block is
 * generated. Export / P2SH-link flows must carry the confirmed values.
 */

function toBigIntOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  try {
    return BigInt(value);
  } catch (_err) {
    return null;
  }
}

function slipBlockId(slip) {
  return toBigIntOrNull(slip?.blockId ?? slip?.block_id);
}

function slipTxOrdinal(slip) {
  return toBigIntOrNull(slip?.txOrdinal ?? slip?.tx_ordinal);
}

function outputsMissingCanonicalLocation(tx) {
  const outputs = Array.isArray(tx?.to) ? tx.to : [];
  if (!outputs.length) {
    return true;
  }
  return outputs.some((slip) => {
    const blockId = slipBlockId(slip);
    const txOrdinal = slipTxOrdinal(slip);
    return blockId == null || blockId === 0n || txOrdinal == null;
  });
}

/**
 * Read block_id / tx_ordinal from a confirmation block + tx, or from slips.
 */
function readTransactionLocation(tx, blk = null) {
  let blockId = null;
  let txOrdinal = null;

  if (blk != null) {
    blockId = toBigIntOrNull(blk.id ?? blk.block_id);
    const txs = Array.isArray(blk.transactions) ? blk.transactions : [];
    if (tx?.signature) {
      const idx = txs.findIndex((candidate) => candidate?.signature === tx.signature);
      if (idx >= 0) {
        txOrdinal = BigInt(idx);
      }
    }
  }

  if ((blockId == null || blockId === 0n) && Array.isArray(tx?.to)) {
    for (const slip of tx.to) {
      const bid = slipBlockId(slip);
      if (bid != null && bid !== 0n) {
        blockId = bid;
        break;
      }
    }
  }

  if (txOrdinal == null && Array.isArray(tx?.to)) {
    for (const slip of tx.to) {
      const ord = slipTxOrdinal(slip);
      if (ord != null) {
        txOrdinal = ord;
        break;
      }
    }
  }

  return {
    blockId,
    txOrdinal,
    transactionId: tx?.signature ? String(tx.signature) : ''
  };
}

/**
 * Stamp output slips with canonical block_id / tx_ordinal / slip_index.
 * Input slips are left unchanged (they already reference prior UTXOs).
 */
function stampOutputSlipLocations(tx, { blockId, txOrdinal } = {}) {
  if (!tx) {
    throw new Error('Transaction is required');
  }

  const resolvedBlockId = toBigIntOrNull(blockId);
  const resolvedTxOrdinal = toBigIntOrNull(txOrdinal);

  if (resolvedBlockId == null || resolvedBlockId === 0n) {
    throw new Error('Confirmed block_id is required to stamp transaction outputs');
  }
  if (resolvedTxOrdinal == null) {
    throw new Error('Confirmed transaction ordinal is required to stamp transaction outputs');
  }

  const outputs = Array.isArray(tx.to) ? tx.to : [];
  for (let i = 0; i < outputs.length; i++) {
    const slip = outputs[i];
    if (!slip) {
      continue;
    }
    slip.blockId = resolvedBlockId;
    slip.txOrdinal = resolvedTxOrdinal;
    slip.index = i;
  }

  return tx;
}

/**
 * Ensure publish-tx outputs carry canonical location before export / unlock use.
 * Prefers explicit hints, then values already on the tx, then confirmation block.
 */
function ensureCanonicalOutputLocations(tx, { blockId = null, txOrdinal = null, blk = null } = {}) {
  if (!tx) {
    throw new Error('Transaction is required');
  }

  const fromBlock = readTransactionLocation(tx, blk);
  const resolvedBlockId = toBigIntOrNull(blockId) ?? fromBlock.blockId;
  const resolvedTxOrdinal = toBigIntOrNull(txOrdinal) ?? fromBlock.txOrdinal;

  if (!outputsMissingCanonicalLocation(tx)) {
    return {
      tx,
      blockId: slipBlockId(tx.to[0]),
      txOrdinal: slipTxOrdinal(tx.to[0]),
      stamped: false
    };
  }

  stampOutputSlipLocations(tx, {
    blockId: resolvedBlockId,
    txOrdinal: resolvedTxOrdinal
  });

  return {
    tx,
    blockId: resolvedBlockId,
    txOrdinal: resolvedTxOrdinal,
    stamped: true
  };
}

function parseP2shShareLink(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('P2SH link is empty.');
  }

  let url;
  try {
    url = new URL(text);
  } catch (_err) {
    // Allow paste of query-only fragments: ?block_id=1&transaction_id=...
    try {
      url = new URL(text, 'https://p2sh.local/');
    } catch (_err2) {
      throw new Error('P2SH link is not a valid URL.');
    }
  }

  const params = url.searchParams;
  const blockId = params.get('block_id') || params.get('blockId') || '';
  const transactionId =
    params.get('transaction_id') ||
    params.get('transactionId') ||
    params.get('signature') ||
    '';
  const scripthash = params.get('scripthash') || '';
  const p2shAddress = params.get('p2sh_address') || params.get('p2shAddress') || '';

  if (!blockId) {
    throw new Error('P2SH link is missing block_id.');
  }
  if (!transactionId) {
    throw new Error('P2SH link is missing transaction_id.');
  }

  return {
    blockId: String(blockId),
    transactionId: String(transactionId),
    scripthash: String(scripthash),
    p2shAddress: String(p2shAddress)
  };
}

async function loadBlockById(app, blockId) {
  const id = toBigIntOrNull(blockId);
  if (id == null || id === 0n) {
    throw new Error('Invalid block_id.');
  }

  const blockchain = app?.blockchain;
  if (!blockchain) {
    throw new Error('Blockchain is unavailable.');
  }

  let hash = '';
  if (typeof blockchain.getLongestChainHashAtId === 'function') {
    hash = await blockchain.getLongestChainHashAtId(id);
  }

  let block = null;
  if (hash && typeof blockchain.loadBlockAsync === 'function') {
    block = await blockchain.loadBlockAsync(String(hash));
  }
  if (!block && hash && typeof blockchain.getBlock === 'function') {
    block = await blockchain.getBlock(String(hash), true);
  }

  // Parent saito-js API accepts numeric ids when not shadowed awkwardly.
  if (!block && typeof blockchain.getBlock === 'function') {
    try {
      block = await blockchain.getBlock(id, true);
    } catch (_err) {
      /* ignore — node wrapper may only accept hashes */
    }
  }

  if (!block) {
    throw new Error(`Could not load block ${id.toString()}.`);
  }

  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  const looksSpv = txs.length > 0 && txs.every((tx) => !tx?.signature);
  if (!txs.length || looksSpv) {
    throw new Error(
      `Block ${id.toString()} does not include full transactions on this node. Try again from a peer that has the block body.`
    );
  }

  return block;
}

/**
 * Fetch the confirmed publish transaction referenced by a P2SH link and ensure
 * output slips carry canonical location fields.
 */
async function fetchTransactionFromP2shLink(app, linkFields) {
  const blockId = linkFields?.blockId;
  const transactionId = String(linkFields?.transactionId || '');
  if (!transactionId) {
    throw new Error('transaction_id is required.');
  }

  const block = await loadBlockById(app, blockId);
  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  const index = txs.findIndex((tx) => String(tx?.signature || '') === transactionId);
  if (index < 0) {
    throw new Error('Transaction was not found in the referenced block.');
  }

  const tx = txs[index];
  ensureCanonicalOutputLocations(tx, {
    blockId: block.id ?? blockId,
    txOrdinal: index,
    blk: block
  });
  return tx;
}

module.exports = {
  toBigIntOrNull,
  outputsMissingCanonicalLocation,
  readTransactionLocation,
  stampOutputSlipLocations,
  ensureCanonicalOutputLocations,
  parseP2shShareLink,
  fetchTransactionFromP2shLink
};
