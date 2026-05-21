/**
 * Console helpers for manual NFT transfer review (sender pre-send, receiver on arrival).
 */

const TX_TYPE_NAMES = {
  0: 'Normal',
  1: 'Fee',
  2: 'GoldenTicket',
  3: 'ATR',
  4: 'Vip',
  5: 'SPV',
  6: 'Issuance',
  7: 'BlockStake',
  8: 'Bound'
};

const SLIP_TYPE_NAMES = {
  0: 'Normal',
  1: 'ATR',
  2: 'VipInput',
  3: 'VipOutput',
  4: 'MinerInput',
  5: 'MinerOutput',
  6: 'RouterInput',
  7: 'RouterOutput',
  8: 'BlockStake',
  9: 'Bound'
};

function bigIntReplacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function slipTypeName(type) {
  return SLIP_TYPE_NAMES[type] ?? String(type);
}

function txTypeName(type) {
  return TX_TYPE_NAMES[type] ?? String(type);
}

function formatSlipLine(prefix, slip, index) {
  const pk = slip?.publicKey || slip?.public_key || '';
  const pkShort = pk ? `${pk.slice(0, 8)}…${pk.slice(-6)}` : '(none)';
  const utxo = slip?.utxoKey || slip?.utxo_key || '';
  const utxoShort = utxo ? `${String(utxo).slice(0, 16)}…` : '(none)';
  return (
    `  ${prefix}[${index}] type=${slipTypeName(slip?.type)} amount=${slip?.amount} ` +
    `block=${slip?.blockId ?? slip?.block_id} txOrd=${slip?.txOrdinal ?? slip?.tx_ordinal} ` +
    `idx=${slip?.index ?? slip?.slip_index} pk=${pkShort} utxo=${utxoShort}`
  );
}

/**
 * Build a JSON-safe object from a saito-js Transaction (after sign, before propagate).
 */
function txToReviewObject(tx) {
  if (!tx) {
    return null;
  }
  try {
    if (typeof tx.unpackData === 'function') {
      tx.unpackData();
    }
  } catch (e) {
    /* ignore */
  }
  const base = typeof tx.toJson === 'function' ? tx.toJson() : {};
  let msg = tx.msg;
  if (msg === undefined && base.buffer) {
    try {
      msg = JSON.parse(Buffer.from(base.buffer, 'base64').toString('utf-8'));
    } catch (e) {
      msg = { _parse_error: String(e) };
    }
  }
  return {
    signature: base.signature ?? tx.signature,
    type: base.type ?? tx.type,
    type_name: txTypeName(base.type ?? tx.type),
    timestamp: base.timestamp ?? tx.timestamp,
    total_fees: base.total_fees ?? tx.total_fees,
    txs_replacements: base.txs_replacements ?? tx.txs_replacements,
    from: base.from ?? [],
    to: base.to ?? [],
    msg: msg || {},
    routing_path: base.routing_path ?? tx.routing_path ?? []
  };
}

function formatTxHuman(obj) {
  if (!obj) {
    return '(no transaction)';
  }
  const lines = [
    `signature: ${obj.signature}`,
    `type: ${obj.type_name} (${obj.type})`,
    `timestamp: ${obj.timestamp}`,
    `total_fees: ${obj.total_fees}`,
    `txs_replacements: ${obj.txs_replacements}`,
    `from (${obj.from?.length ?? 0}):`
  ];
  (obj.from || []).forEach((s, i) => lines.push(formatSlipLine('from', s, i)));
  lines.push(`to (${obj.to?.length ?? 0}):`);
  (obj.to || []).forEach((s, i) => lines.push(formatSlipLine('to', s, i)));
  if (obj.routing_path?.length) {
    lines.push(`routing_path (${obj.routing_path.length}):`);
    obj.routing_path.forEach((hop, i) => {
      lines.push(
        `  hop[${i}] from=${hop?.from?.slice?.(0, 12)}… to=${hop?.to?.slice?.(0, 12)}…`
      );
    });
  }
  lines.push('tx.msg / data:');
  try {
    lines.push(JSON.stringify(obj.msg, bigIntReplacer, 2));
  } catch (e) {
    lines.push(String(obj.msg));
  }
  return lines.join('\n');
}

/**
 * Sender: log full signed tx immediately before propagateTransaction.
 */
function logTxReview(tx, label = 'pre-propagate') {
  const obj = txToReviewObject(tx);
  const tag = `[NFT-TX-DUMP] ${label}`;
  console.log(`${tag} JSON:\n${JSON.stringify(obj, bigIntReplacer, 2)}`);
  console.log(`${tag} human-readable:\n${formatTxHuman(obj)}`);
}

/**
 * Receiver: log OnNFTReceived payload (summary from Rust wallet; not full serialized tx).
 */
function logNftArrival(payload, label = 'on-nft-received') {
  const tag = `[NFT-TX-DUMP] ${label}`;
  let obj = payload;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload);
    } catch (e) {
      obj = { raw: payload };
    }
  }
  console.log(`${tag} JSON:\n${JSON.stringify(obj, bigIntReplacer, 2)}`);
  const lines = [
    `event: ${label}`,
    `transaction_signature: ${obj.transaction_signature ?? obj.signature ?? '(missing)'}`,
    `block_id: ${obj.block_id}`,
    `block_hash: ${obj.block_hash}`,
    `timestamp: ${obj.timestamp}`,
    `sender: ${obj.sender ?? obj.sender_publickey}`,
    `receiver: ${obj.receiver}`,
    `ticker: ${obj.ticker ?? '(none)'}`,
    `nft_id: ${obj.nft_id}`,
    `amount: ${obj.amount}`,
    `slip1_utxo: ${obj.slip1_utxo}`,
    `slip2_utxo: ${obj.slip2_utxo}`,
    `slip3_utxo: ${obj.slip3_utxo}`
  ];
  console.log(`${tag} human-readable:\n${lines.join('\n')}`);
}

module.exports = {
  logTxReview,
  logNftArrival,
  txToReviewObject,
  formatTxHuman
};
