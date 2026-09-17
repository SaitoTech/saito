const { formatSlipTypeName } = require('./transaction-types');

const UTXO_KEY_BYTE_LENGTH = 59;
const UTXO_KEY_HEX_LENGTH = UTXO_KEY_BYTE_LENGTH * 2;

function normalizeUtxoKeyHex(raw = '') {
  let value = String(raw || '').trim();
  if (value.startsWith('0x') || value.startsWith('0X')) {
    value = value.slice(2);
  }
  return value.toLowerCase();
}

function isUtxoKeyHex(raw = '') {
  const hex = normalizeUtxoKeyHex(raw);
  return /^[0-9a-f]+$/.test(hex) && hex.length === UTXO_KEY_HEX_LENGTH;
}

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function readUint64Be(bytes, offset) {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) + BigInt(bytes[offset + i]);
  }
  return value;
}

function bytesToHex(bytes) {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseUtxoKeyHex(raw = '') {
  const hex = normalizeUtxoKeyHex(raw);
  if (!isUtxoKeyHex(hex)) {
    return null;
  }

  const bytes = hexToBytes(hex);
  const publicKeyHex = bytesToHex(bytes.slice(0, 33));
  const blockId = readUint64Be(bytes, 33);
  const txOrdinal = readUint64Be(bytes, 41);
  const slipIndex = bytes[49];
  const amount = readUint64Be(bytes, 50);
  const slipType = bytes[58];

  return {
    utxokey: hex,
    publicKeyHex,
    blockId,
    txOrdinal,
    slipIndex,
    amount,
    slipType,
    slipTypeName: formatSlipTypeName(slipType)
  };
}

module.exports = {
  UTXO_KEY_BYTE_LENGTH,
  UTXO_KEY_HEX_LENGTH,
  normalizeUtxoKeyHex,
  isUtxoKeyHex,
  parseUtxoKeyHex
};
