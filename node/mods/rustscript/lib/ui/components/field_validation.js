const { isPlaceholder } = require('./placeholder_utils');

/** UI-only lightweight format hints — not execution validation. */

function inferFieldKind(pathKey) {
  const k = String(pathKey ?? '').toLowerCase();
  if (k === 'publickey' || k === 'publickeys' || k.endsWith('pubkey')) {
    return 'publickey';
  }
  if (k === 'signature' || k === 'signatures') {
    return 'signature';
  }
  if (k === 'hash') {
    return 'hash';
  }
  if (k === 'timestamp' || k === 'time' || k === 'blocktime') {
    return 'timestamp';
  }
  if (k === 'msg' || k === 'message') {
    return 'message';
  }
  return 'text';
}

function inferFieldKindFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return 'text';
  }
  return inferFieldKind(path[path.length - 1]);
}

function validateField(kind, value) {
  if (value === null || value === undefined) {
    return { valid: true, state: 'empty' };
  }

  const s = String(value).trim();
  if (!s || isPlaceholder(s)) {
    return { valid: true, state: 'empty' };
  }

  switch (kind) {
    case 'publickey': {
      const hex = /^[0-9a-fA-F]+$/.test(s);
      const len = s.length >= 64 && s.length <= 132;
      return {
        valid: hex && len,
        state: hex && len ? 'valid' : 'warn',
        message: 'Expected a hex Saito public key'
      };
    }
    case 'hash': {
      const ok = /^[0-9a-fA-F]{64}$/.test(s);
      return {
        valid: ok,
        state: ok ? 'valid' : 'warn',
        message: 'Expected 64-character hex hash (Blake3)'
      };
    }
    case 'signature': {
      const hex = /^[0-9a-fA-F]+$/.test(s);
      const len = s.length >= 128;
      return {
        valid: hex && len,
        state: hex && len ? 'valid' : 'warn',
        message: 'Expected hex signature bytes'
      };
    }
    case 'timestamp': {
      const n = Number(s);
      const ok = Number.isFinite(n) && n > 0 && n < 4e15;
      return {
        valid: ok,
        state: ok ? 'valid' : 'warn',
        message: 'Expected unix timestamp (milliseconds)'
      };
    }
    default:
      return { valid: true, state: 'valid' };
  }
}

function findSignableMessage(script, lockingScript) {
  const sources = [script, lockingScript].filter(Boolean);

  for (const src of sources) {
    const direct = pickMessage(src?.msg ?? src?.message);
    if (direct) {
      return direct;
    }

    const witness = src?.witness;
    if (witness && typeof witness === 'object') {
      const w = pickMessage(witness.msg ?? witness.message);
      if (w) {
        return w;
      }
    }
  }

  return '';
}

function pickMessage(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const s = value.trim();
  if (!s || isPlaceholder(s)) {
    return '';
  }
  return s;
}

module.exports = {
  inferFieldKind,
  inferFieldKindFromPath,
  validateField,
  findSignableMessage
};
