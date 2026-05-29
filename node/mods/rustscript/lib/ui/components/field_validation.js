const { isPlaceholder, getAtPath } = require('./placeholder_utils');

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

function isSaitoPublicKey(value, app) {
  const s = String(value ?? '').trim();
  if (!s) {
    return false;
  }
  if (app?.crypto?.isPublicKey) {
    return app.crypto.isPublicKey(s);
  }
  return /^[A-HJ-NP-Za-km-z1-9]+$/.test(s) && s.length >= 40 && s.length <= 50;
}

function validateForApply(kind, value, app) {
  const s = String(value ?? '').trim();
  if (!s) {
    return { ok: false, message: 'A value is required' };
  }
  if (isPlaceholder(s)) {
    return { ok: false, message: 'Enter a real value — placeholders cannot be applied' };
  }

  const result = validateField(kind, s, app);
  if (!result.valid) {
    return {
      ok: false,
      message: result.message || 'Value format is invalid'
    };
  }

  return { ok: true, value: s };
}

function validateField(kind, value, app) {
  if (value === null || value === undefined) {
    return { valid: true, state: 'empty' };
  }

  const s = String(value).trim();
  if (!s || isPlaceholder(s)) {
    return { valid: true, state: 'empty' };
  }

  switch (kind) {
    case 'publickey': {
      const ok = isSaitoPublicKey(s, app);
      return {
        valid: ok,
        state: ok ? 'valid' : 'warn',
        message: 'Expected a Saito public key'
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

function pickPublicKey(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const s = value.trim();
  if (!s || isPlaceholder(s)) {
    return '';
  }
  return s;
}

/**
 * Resolve opcode node + required keys for a witness signature field path.
 * Works for CHECKSIG, CHECKMULTISIG, and nested AND/OR trees.
 */
function findSignatureContext(script, path) {
  if (!script || !Array.isArray(path) || path.length === 0) {
    return { message: '', requiredPublicKeys: [], signatureIndex: null };
  }

  let nodePath = path.slice();
  let signatureIndex = null;
  const last = nodePath[nodePath.length - 1];

  if (last === 'signature') {
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness') {
      nodePath.pop();
    }
  } else if (typeof last === 'number' && nodePath[nodePath.length - 2] === 'signatures') {
    signatureIndex = last;
    nodePath.pop();
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness') {
      nodePath.pop();
    }
  } else if (last === 'signatures') {
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness') {
      nodePath.pop();
    }
  }

  const node = getAtPath(script, nodePath);
  const requiredPublicKeys = [];

  if (node && typeof node === 'object') {
    const pk = pickPublicKey(node.publickey);
    if (pk) {
      requiredPublicKeys.push(pk);
    }
    if (Array.isArray(node.publickeys)) {
      for (const key of node.publickeys) {
        const k = pickPublicKey(key);
        if (k && !requiredPublicKeys.includes(k)) {
          requiredPublicKeys.push(k);
        }
      }
    }
  }

  const message =
    (node && pickMessage(node.msg ?? node.message)) || findSignableMessage(script);

  return { message, requiredPublicKeys, signatureIndex };
}

async function walletOwnsRequiredKey(app, requiredPublicKeys) {
  if (!Array.isArray(requiredPublicKeys) || requiredPublicKeys.length === 0) {
    return false;
  }
  try {
    const mine = String((await app.wallet.getPublicKey()) || '').trim();
    if (!mine) {
      return false;
    }
    return requiredPublicKeys.some((pk) => pk === mine);
  } catch (err) {
    return false;
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
  isSaitoPublicKey,
  validateField,
  validateForApply,
  findSignableMessage,
  findSignatureContext,
  walletOwnsRequiredKey
};
