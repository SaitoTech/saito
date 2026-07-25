const DEFAULT_GENESIS_PERIOD = 80640;
const ATR_TRANSACTION_TYPE = 3;

function slipPublicKey(slip) {
  return slip?.publicKey || slip?.public_key || '';
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

function isScriptingPublicKey(app, publicKey) {
  if (!publicKey) {
    return false;
  }

  try {
    if (app?.crypto?.fromBase58) {
      const hex = app.crypto.fromBase58(String(publicKey));
      return hex.startsWith('00');
    }
  } catch (err) {
    // fall through to raw hex check
  }

  const raw = String(publicKey).toLowerCase();
  return raw.startsWith('00') && raw.length >= 4;
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
      signature: tx.signature || json.signature || json.hash || '',
      type: tx.type ?? tx.transaction_type ?? json.type ?? json.transaction_type,
      from: Array.isArray(tx.from) ? tx.from : json.from || [],
      to: Array.isArray(tx.to) ? tx.to : json.to || []
    };
  }

  return {
    signature: tx.signature || tx.hash || '',
    type: tx.type ?? tx.transaction_type,
    from: Array.isArray(tx.from) ? tx.from : [],
    to: Array.isArray(tx.to) ? tx.to : []
  };
}

function isAtrTransaction(tx) {
  if (!tx) {
    return false;
  }

  const type = tx.type ?? tx.transaction_type;
  if (type === 'ATR') {
    return true;
  }

  return Number(type) === ATR_TRANSACTION_TYPE;
}

function collectTransactionPublicKeys(tx) {
  const keys = new Set();

  for (const slip of tx.from || []) {
    const publicKey = slipPublicKey(slip);
    if (publicKey) {
      keys.add(publicKey);
    }
  }

  for (const slip of tx.to || []) {
    const publicKey = slipPublicKey(slip);
    if (publicKey) {
      keys.add(publicKey);
    }
  }

  return keys;
}

function txHasScriptingAddress(app, tx) {
  for (const slip of [...(tx.from || []), ...(tx.to || [])]) {
    if (isScriptingPublicKey(app, slipPublicKey(slip))) {
      return true;
    }
  }
  return false;
}

function computeRecipient(app, publicKey, tx, allKeys) {
  if (isScriptingPublicKey(app, publicKey)) {
    return 2;
  }

  if (txHasScriptingAddress(app, tx)) {
    return 2;
  }

  const otherKeys = new Set(allKeys);
  otherKeys.delete(publicKey);
  if (otherKeys.size === 0) {
    return 0;
  }

  return 1;
}

function computeDelta(publicKey, tx) {
  if (isAtrTransaction(tx)) {
    let deposit = 0n;
    for (const slip of tx.to || []) {
      if (slipPublicKey(slip) === publicKey) {
        deposit += slipAmountValue(slip);
      }
    }
    return deposit;
  }

  let delta = 0n;

  for (const slip of tx.from || []) {
    if (slipPublicKey(slip) === publicKey) {
      delta -= slipAmountValue(slip);
    }
  }

  for (const slip of tx.to || []) {
    if (slipPublicKey(slip) === publicKey) {
      delta += slipAmountValue(slip);
    }
  }

  return delta;
}

function collectToPublicKeys(tx) {
  const keys = new Set();

  for (const slip of tx.to || []) {
    const publicKey = slipPublicKey(slip);
    if (publicKey) {
      keys.add(publicKey);
    }
  }

  return keys;
}

function toStorageInteger(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function buildAddressRowsFromTransaction(app, tx, blockMeta) {
  const normalized = normalizeTransaction(tx);
  if (!normalized?.signature) {
    return [];
  }

  const allKeys = collectTransactionPublicKeys(normalized);
  if (!allKeys.size) {
    return [];
  }

  const isAtr = isAtrTransaction(normalized);
  const keysToProcess = isAtr ? collectToPublicKeys(normalized) : allKeys;

  const rows = [];
  for (const publicKey of keysToProcess) {
    const delta = computeDelta(publicKey, normalized);

    // Normal txs: skip zero/negative net movement (self-change, fee-only, etc.).
    // ATR txs: exempt — delta is the full output deposit, not net in/out.
    // Prior rows for older blocks are removed when ATR rebroadcast prunes.
    if (!isAtr && delta <= 0n) {
      continue;
    }

    if (delta <= 0n) {
      continue;
    }

    rows.push({
      publickey: publicKey,
      tx_hash: normalized.signature,
      block_hash: blockMeta.block_hash,
      block_id: blockMeta.block_id,
      is_longest_chain: blockMeta.is_longest_chain,
      recipient: computeRecipient(app, publicKey, normalized, allKeys),
      delta: toStorageInteger(delta)
    });
  }

  return rows;
}

function buildAddressRowsFromBlock(app, block, longestChain = true) {
  if (!block?.id || !block?.hash) {
    return [];
  }

  const blockMeta = {
    block_id: toStorageInteger(block.id),
    block_hash: block.hash,
    is_longest_chain: longestChain ? 1 : 0
  };

  const transactions = Array.isArray(block.transactions) ? block.transactions : [];
  const rows = [];

  for (let i = 0; i < transactions.length; i++) {
    rows.push(...buildAddressRowsFromTransaction(app, transactions[i], blockMeta));
  }

  return rows;
}

function blockContainsAtrTransaction(block) {
  const transactions = Array.isArray(block?.transactions) ? block.transactions : [];
  for (let i = 0; i < transactions.length; i++) {
    const normalized = normalizeTransaction(transactions[i]);
    if (isAtrTransaction(normalized)) {
      return true;
    }
  }
  return false;
}

function returnGenesisPeriod(app) {
  const configured = Number(app?.options?.consensus?.genesis_period);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_GENESIS_PERIOD;
}

module.exports = {
  DEFAULT_GENESIS_PERIOD,
  ATR_TRANSACTION_TYPE,
  buildAddressRowsFromBlock,
  buildAddressRowsFromTransaction,
  blockContainsAtrTransaction,
  computeDelta,
  computeRecipient,
  isAtrTransaction,
  isScriptingPublicKey,
  returnGenesisPeriod
};
