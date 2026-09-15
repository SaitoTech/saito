const { SLIP_TYPE_NAMES } = require('./transaction-types');

const SLIP_TYPE_IDS = {};
for (const [key, name] of Object.entries(SLIP_TYPE_NAMES)) {
  if (/^[0-9]+$/.test(key)) {
    SLIP_TYPE_IDS[name] = Number(key);
  }
}

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

function numericSlipType(type) {
  if (type == null || type === '') {
    return null;
  }
  if (typeof type === 'number' && Number.isFinite(type)) {
    return type;
  }
  if (typeof type === 'bigint') {
    return Number(type);
  }
  const asNumber = Number(type);
  if (Number.isFinite(asNumber) && String(asNumber) === String(type).trim()) {
    return asNumber;
  }
  if (SLIP_TYPE_IDS[type] != null) {
    return SLIP_TYPE_IDS[type];
  }
  return null;
}

function slipTypeId(slip) {
  return numericSlipType(slipField(slip, 'type', 'slip_type'));
}

function isBoundSlip(slip) {
  return slipTypeId(slip) === SLIP_TYPE_IDS.Bound;
}

function isCustodySlip(slip) {
  const type = slipTypeId(slip);
  return type === SLIP_TYPE_IDS.Normal || type === SLIP_TYPE_IDS.ATR;
}

function slipAmount(slip) {
  if (slip == null) {
    return 0n;
  }
  try {
    return BigInt(slipField(slip, 'amount', 'amount') ?? 0);
  } catch (err) {
    return 0n;
  }
}

function isNftTuple(slips, index) {
  if (!slips || index + 2 >= slips.length) {
    return false;
  }
  return (
    isBoundSlip(slips[index]) &&
    isCustodySlip(slips[index + 1]) &&
    isBoundSlip(slips[index + 2])
  );
}

function hexToBytes(hex) {
  const clean = String(hex || '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function publicKeyToBytes(app, publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) {
    return null;
  }

  if (/^[0-9a-fA-F]{66}$/.test(key)) {
    return hexToBytes(key);
  }

  try {
    if (app?.crypto?.fromBase58) {
      const hex = app.crypto.fromBase58(key);
      const bytes = hexToBytes(hex);
      if (bytes?.length === 33) {
        return bytes;
      }
      if (bytes?.length === 34 && bytes[0] === 0) {
        return bytes.slice(1);
      }
    }
  } catch (err) {
    // not base58
  }

  return null;
}

function readUint64Be(bytes, offset) {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) + BigInt(bytes[offset + i]);
  }
  return value;
}

function parseNftUuid(app, publicKey) {
  const bytes = publicKeyToBytes(app, publicKey);
  if (!bytes || bytes.length !== 33) {
    return {
      nftId: '',
      nftType: '',
      mintBlockId: '',
      mintTxOrdinal: '',
      mintSlipIndex: ''
    };
  }

  const typeBytes = bytes.slice(17);
  let end = typeBytes.length;
  while (end > 0 && typeBytes[end - 1] === 0) {
    end -= 1;
  }
  let nftType = '';
  try {
    nftType = new TextDecoder().decode(typeBytes.subarray(0, end)).replace(/\0+$/g, '');
  } catch (err) {
    nftType = '';
  }

  return {
    nftId: bytesToHex(bytes),
    nftType,
    mintBlockId: readUint64Be(bytes, 0).toString(),
    mintTxOrdinal: readUint64Be(bytes, 8).toString(),
    mintSlipIndex: String(bytes[16])
  };
}

function nolanFromNonBoundSlips(slips = []) {
  let total = 0n;
  for (let i = 0; i < slips.length; i++) {
    if (isBoundSlip(slips[i])) {
      continue;
    }
    total += slipAmount(slips[i]);
  }
  return total;
}

function nftQuantityFromSlips(slips = []) {
  let total = 0n;
  for (let i = 0; i + 2 < slips.length; i++) {
    if (!isNftTuple(slips, i)) {
      continue;
    }
    total += slipAmount(slips[i]);
    i += 2;
  }
  return total;
}

function groupSlips(slips = []) {
  const groups = [];
  let i = 0;
  while (i < slips.length) {
    if (isNftTuple(slips, i)) {
      groups.push({
        kind: 'nft',
        slips: [slips[i], slips[i + 1], slips[i + 2]]
      });
      i += 3;
      continue;
    }
    groups.push({
      kind: 'slip',
      slips: [slips[i]]
    });
    i += 1;
  }
  return groups;
}

module.exports = {
  slipField,
  slipTypeId,
  slipAmount,
  isBoundSlip,
  isNftTuple,
  parseNftUuid,
  nolanFromNonBoundSlips,
  nftQuantityFromSlips,
  groupSlips
};
