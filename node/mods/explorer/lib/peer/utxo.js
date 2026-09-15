const Slip = require('saito-js/lib/slip').default;
const { success, failure, requestParams } = require('./response');
const { normalizeUtxoKeyHex, isUtxoKeyHex, parseUtxoKeyHex } = require('../utxo-key');

function slipField(slip, camel, snake) {
  if (!slip) {
    return null;
  }
  if (slip[camel] != null && slip[camel] !== '') {
    return slip[camel];
  }
  if (slip[snake] != null && slip[snake] !== '') {
    return slip[snake];
  }
  return null;
}

function keysMatch(left, right) {
  return normalizeUtxoKeyHex(left) === normalizeUtxoKeyHex(right);
}

function outputMatchesParsed(output, parsed) {
  if (!output || !parsed) {
    return false;
  }

  const outputKey = slipField(output, 'utxoKey', 'utxo_key');
  if (outputKey && keysMatch(outputKey, parsed.utxokey)) {
    return true;
  }

  const blockId = slipField(output, 'blockId', 'block_id');
  const txOrdinal = slipField(output, 'txOrdinal', 'tx_ordinal');
  const slipIndex = slipField(output, 'index', 'slip_index');
  const amount = slipField(output, 'amount', 'amount');
  const type = slipField(output, 'type', 'slip_type');

  try {
    return (
      BigInt(blockId ?? -1) === parsed.blockId &&
      BigInt(txOrdinal ?? -1) === parsed.txOrdinal &&
      Number(slipIndex) === parsed.slipIndex &&
      BigInt(amount ?? -1) === parsed.amount &&
      Number(type) === parsed.slipType
    );
  } catch (err) {
    return false;
  }
}

async function creatingOutputExists(app, parsed) {
  if (!parsed || parsed.blockId <= 0n) {
    return false;
  }

  try {
    const block = await app.core.blockchain.getBlock(BigInt(parsed.blockId.toString()), true);
    if (!block) {
      return false;
    }

    const transactions = block.transactions || [];
    const txIndex = Number(parsed.txOrdinal);
    if (!Number.isFinite(txIndex) || txIndex < 0 || txIndex >= transactions.length) {
      return false;
    }

    const tx = transactions[txIndex];
    let outputs = tx?.to || [];
    if (typeof tx?.toJson === 'function') {
      try {
        outputs = tx.toJson().to || outputs;
      } catch (err) {
        // keep wrapper slips
      }
    }
    const output = outputs[parsed.slipIndex];
    return outputMatchesParsed(output, parsed);
  } catch (err) {
    return false;
  }
}

async function isUtxoSpendable(app, utxokey) {
  try {
    if (typeof app?.blockchain?.isSlipSpendable === 'function') {
      return (await app.blockchain.isSlipSpendable(utxokey)) === true;
    }
  } catch (err) {
    return false;
  }
  return false;
}

function publicKeyBase58(app, publicKeyHex) {
  try {
    if (app?.crypto?.toBase58) {
      return app.crypto.toBase58(publicKeyHex);
    }
  } catch (err) {
    // keep hex
  }
  return publicKeyHex;
}

async function handleRequestUtxo(app, txmsg) {
  const params = requestParams(txmsg);
  const rawKey = params.utxokey || params.utxo_key || params.key;
  const utxokey = normalizeUtxoKeyHex(rawKey);

  if (!isUtxoKeyHex(utxokey)) {
    return failure('utxokey required');
  }

  const parsed = parseUtxoKeyHex(utxokey);
  if (!parsed) {
    return success({
      utxokey,
      status: 'NOT FOUND',
      slip: null
    });
  }

  let wasmSlip = null;
  try {
    wasmSlip = Slip.fromUtxoKey(utxokey);
  } catch (err) {
    wasmSlip = null;
  }

  const spendable = await isUtxoSpendable(app, utxokey);
  const hasValue = parsed.amount > 0n;
  let status = 'NOT FOUND';
  if (spendable) {
    status = 'SPENDABLE';
  } else if (!hasValue) {
    // amount === 0 slips are never inserted into the UTXO hashmap
    status = 'ZERO FEE';
  } else if (await creatingOutputExists(app, parsed)) {
    status = 'SPENT';
  }

  return success({
    utxokey,
    status,
    slip: {
      publicKey: wasmSlip?.publicKey || publicKeyBase58(app, parsed.publicKeyHex),
      publicKeyHex: parsed.publicKeyHex,
      type: parsed.slipTypeName,
      typeId: parsed.slipType,
      blockId: parsed.blockId.toString(),
      transactionId: parsed.txOrdinal.toString(),
      slipIndex: String(parsed.slipIndex),
      amount: parsed.amount.toString()
    }
  });
}

module.exports = {
  handleRequestUtxo
};
