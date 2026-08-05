const Transaction = require('./../../../lib/saito/transaction').default;

/**
 * Canonical on-disk / share-link transaction format for RustScript and future consumers.
 *
 * Web serialization: { t, m, opt } — matches Transaction.serialize_to_web() /
 * deserialize_from_web() used across Saito (archive, devtools, wallet exports).
 *
 * Import also accepts legacy slip-array JSON ({ from, to, ... }) for compatibility;
 * export always uses web serialization for a lossless round-trip with import.
 */
const FORMAT_WEB = 'web';

function serializeTransactionToWeb(app, tx) {
  if (!tx || typeof tx.serialize_to_web !== 'function') {
    throw new Error('Transaction is required');
  }
  if (!app) {
    throw new Error('Saito app is required');
  }
  return tx.serialize_to_web(app);
}

/**
 * Parse transaction file text — prefers web serialization, falls back to slip-array JSON.
 */
function parseTransactionFile(app, text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('File is empty.');
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error('File is not valid JSON.');
  }

  let tx;
  if (json && typeof json.t === 'string' && json.m !== undefined) {
    tx = new Transaction();
    tx.deserialize_from_web(app, raw);
  } else if (json && Array.isArray(json.from) && Array.isArray(json.to)) {
    tx = new Transaction(undefined, json);
  } else {
    throw new Error('Unrecognized transaction file format.');
  }

  const hasFrom = Array.isArray(tx.from) && tx.from.length > 0;
  const hasTo = Array.isArray(tx.to) && tx.to.length > 0;
  if (!hasFrom && !hasTo) {
    throw new Error('Transaction file could not be deserialized.');
  }

  return tx;
}

function sanitizeFilenamePart(value, maxLen = 12) {
  const text = String(value || 'unknown').replace(/[^\w.-]+/g, '');
  if (!text) {
    return 'unknown';
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

/**
 * Native RustScript artifact filename (.saito).
 * - Saved scripts / drafts → rustscript-[timestamp].saito
 * - Published / signed txs → rustscript-tx-[signature].saito
 */
function transactionExportFilename(tx, prefix = 'rustscript') {
  const kind = String(prefix || 'rustscript').toLowerCase();
  const isScriptDraft =
    kind === 'rustscript' ||
    kind.includes('draft') ||
    kind.includes('script');

  if (isScriptDraft && !kind.includes('published') && !kind.includes('tx')) {
    return `rustscript-${Date.now()}.saito`;
  }

  const sig = sanitizeFilenamePart(tx?.signature, 12);
  return `rustscript-tx-${sig}.saito`;
}

/**
 * Trigger a browser download of the canonical web-serialized transaction.
 * Content remains JSON; the .saito extension marks it as a RustScript artifact.
 */
function downloadTransactionFile(app, tx, { filename } = {}) {
  const json = serializeTransactionToWeb(app, tx);
  const name = filename || transactionExportFilename(tx);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename: name, json };
}

module.exports = {
  FORMAT_WEB,
  serializeTransactionToWeb,
  parseTransactionFile,
  transactionExportFilename,
  downloadTransactionFile
};
