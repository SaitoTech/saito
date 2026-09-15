const { UTXO_KEY_BYTE_LENGTH } = require('./utxo-key');

function normalizeSearchQuery(raw = '') {
  return String(raw || '').trim();
}

function decodedByteLength(app, value) {
  if (!value) {
    return 0;
  }

  if (/^[0-9a-fA-F]+$/.test(value)) {
    if (value.length % 2 !== 0) {
      return 0;
    }
    return value.length / 2;
  }

  try {
    if (app?.crypto?.fromBase58) {
      const hex = app.crypto.fromBase58(value);
      if (hex && hex.length % 2 === 0) {
        return hex.length / 2;
      }
    }
  } catch (err) {
    // not base58
  }

  return 0;
}

function classifyBlockIdentifier(app, raw = '') {
  const query = normalizeSearchQuery(raw);
  if (!query) {
    return null;
  }

  const byteLength = decodedByteLength(app, query);

  if (byteLength === 32) {
    return { type: 'hash', value: query };
  }

  if (/^[0-9]+$/.test(query)) {
    return { type: 'block_id', value: query };
  }

  return { type: 'hash', value: query };
}

function blockLookupArgument(app, raw = '') {
  const classified = classifyBlockIdentifier(app, raw);
  if (!classified) {
    return null;
  }
  if (classified.type === 'block_id') {
    return BigInt(classified.value);
  }
  return classified.value;
}

function classifySearchQuery(app, raw = '') {
  const query = normalizeSearchQuery(raw);
  if (!query) {
    return null;
  }

  const byteLength = decodedByteLength(app, query);

  if (byteLength === 33) {
    return { type: 'address', value: query };
  }

  if (byteLength === 32) {
    return { type: 'block', value: query };
  }

  if (byteLength === UTXO_KEY_BYTE_LENGTH) {
    return { type: 'utxo', value: query };
  }

  return null;
}

module.exports = {
  normalizeSearchQuery,
  classifySearchQuery,
  classifyBlockIdentifier,
  blockLookupArgument,
  decodedByteLength
};
