function normalizeTransactionSignature(raw) {
  const value = String(raw || '').trim();
  if (!/^[0-9a-fA-F]{128}$/.test(value)) {
    return '';
  }
  return value.toLowerCase();
}

function describeTransactionLookup(signature, mempoolTx, indexed) {
  if (mempoolTx) {
    return {
      signature,
      status: 'UNCONFIRMED',
      source: 'mempool',
      block_id: '',
      block_hash: '',
      transaction_id: '',
      lc: 0,
      created_at: Number(mempoolTx.timestamp) || 0
    };
  }

  if (indexed) {
    const onChain = Number(indexed.lc) === 1;
    return {
      signature,
      status: onChain ? 'CONFIRMED' : 'NOT ON LONGEST CHAIN',
      source: 'database',
      block_id: String(indexed.block_id ?? ''),
      block_hash: String(indexed.block_hash || ''),
      transaction_id: String(indexed.transaction_id ?? ''),
      lc: onChain ? 1 : 0,
      created_at: Number(indexed.created_at) || 0
    };
  }

  return {
    signature,
    status: 'NOT FOUND',
    source: '',
    block_id: '',
    block_hash: '',
    transaction_id: '',
    lc: 0,
    created_at: 0
  };
}

async function findTransactionInMempool(signature) {
  const loaded = require('saito-js/saito');
  const Saito = loaded.default || loaded;
  const mempoolTxs = await Saito.getInstance().getMempoolTxs();
  for (let i = 0; i < mempoolTxs.length; i++) {
    const txjson = mempoolTxs[i];
    if (String(txjson?.signature || '').toLowerCase() === signature) {
      return txjson;
    }
  }
  return null;
}

async function lookupTransaction(mod, signature) {
  const normalized = normalizeTransactionSignature(signature);
  if (!normalized) {
    return null;
  }

  const mempoolTx = await findTransactionInMempool(normalized);
  const indexed = mempoolTx ? null : await mod?.database?.getTransactionBySignature?.(normalized);
  return describeTransactionLookup(normalized, mempoolTx, indexed || null);
}

module.exports = {
  describeTransactionLookup,
  lookupTransaction,
  normalizeTransactionSignature
};
