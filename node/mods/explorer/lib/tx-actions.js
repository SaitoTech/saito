const Transaction = require('./../../../lib/saito/transaction').default;
const {
  ensureCanonicalOutputLocations,
  readTransactionLocation
} = require('../../rustscript/lib/tx_location');

const SLIP_TYPE_P2SH = 10;
const RUSTSCRIPT_IMPORT_KEY = 'rustscript_explorer_import';
const RUSTSCRIPT_MODULE_PATH = '/rustscript';

function getTxMsg(tx) {
  if (tx && typeof tx.returnMessage === 'function') {
    return tx.returnMessage() || {};
  }
  return tx?.msg && typeof tx.msg === 'object' ? tx.msg : {};
}

function isP2shInputSlip(slip) {
  if (!slip) {
    return false;
  }
  const type = Number(slip.type ?? slip.slip_type);
  if (type === SLIP_TYPE_P2SH) {
    return true;
  }
  const pk = String(slip.publicKey || slip.public_key || '');
  return pk.length >= 66 && pk.startsWith('00');
}

/**
 * Unlock targets: P2SH marker inputs on spend txs, or script-locked publish outputs.
 */
function collectP2shUnlockTargets(tx) {
  const targets = [];
  const from = Array.isArray(tx?.from) ? tx.from : [];

  for (let i = 0; i < from.length; i++) {
    if (!isP2shInputSlip(from[i])) {
      continue;
    }
    const slipIndex = Number(from[i]?.index ?? from[i]?.slip_index ?? i);
    targets.push({
      id: `input-${i}`,
      kind: 'input',
      fromIndex: i,
      slipIndex,
      label: `P2SH input — block ${from[i]?.blockId ?? from[i]?.block_id ?? '—'}, tx ${from[i]?.txOrdinal ?? from[i]?.tx_ordinal ?? '—'}, slip ${slipIndex}`
    });
  }

  const txmsg = getTxMsg(tx);
  const isPublishLock =
    txmsg?.request === 'publish p2sh' ||
    (typeof txmsg?.access_script === 'string' && txmsg.access_script.trim().length > 0);

  if (isPublishLock) {
    targets.push({
      id: 'publish-lock',
      kind: 'publish',
      label: 'Script-locked output (publish transaction)'
    });
  }

  return targets;
}

function hasP2shUnlockTargets(tx) {
  return collectP2shUnlockTargets(tx).length > 0;
}

function rawTxToTransaction(app, rawTx) {
  if (!rawTx) {
    return null;
  }
  if (typeof rawTx.serialize_to_web === 'function') {
    return rawTx;
  }
  return new Transaction(undefined, rawTx);
}

/**
 * Stamp output slips with the confirming block's canonical location before
 * serialization / download / RustScript hand-off.
 */
function prepareTransactionForExport(app, rawTx, { blk = null, blockId = null, txOrdinal = null } = {}) {
  const tx = rawTxToTransaction(app, rawTx);
  if (!tx || typeof tx.serialize_to_web !== 'function') {
    throw new Error('Transaction could not be serialized.');
  }

  const location = readTransactionLocation(tx, blk);
  const resolvedBlockId = blockId != null && String(blockId) !== '' ? blockId : location.blockId;
  const resolvedTxOrdinal =
    txOrdinal != null && String(txOrdinal) !== '' ? txOrdinal : location.txOrdinal;

  ensureCanonicalOutputLocations(tx, {
    blockId: resolvedBlockId,
    txOrdinal: resolvedTxOrdinal,
    blk
  });

  return tx;
}

function exportTransaction(app, rawTx, options = {}) {
  const tx = prepareTransactionForExport(app, rawTx, options);

  const json = tx.serialize_to_web(app);
  const sig = String(tx.signature || 'unknown').replace(/[^\w.-]+/g, '_');
  const filename = `explorer-tx-${sig}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function queueRustscriptImport(app, rawTx, target, options = {}) {
  const tx = prepareTransactionForExport(app, rawTx, options);

  const payload = {
    tx: JSON.parse(tx.serialize_to_web(app)),
    target: target || null
  };

  sessionStorage.setItem(RUSTSCRIPT_IMPORT_KEY, JSON.stringify(payload));
}

function navigateToRustscript() {
  if (typeof navigateWindow === 'function') {
    navigateWindow(RUSTSCRIPT_MODULE_PATH);
    return;
  }
  window.location.href = RUSTSCRIPT_MODULE_PATH;
}

function unlockTransactionInRustscript(app, rawTx, target, options = {}) {
  queueRustscriptImport(app, rawTx, target, options);
  navigateToRustscript();
}

module.exports = {
  SLIP_TYPE_P2SH,
  RUSTSCRIPT_IMPORT_KEY,
  collectP2shUnlockTargets,
  hasP2shUnlockTargets,
  prepareTransactionForExport,
  exportTransaction,
  unlockTransactionInRustscript,
  queueRustscriptImport,
  navigateToRustscript
};
