/**
 * P2SH address derivation — mirrors Rust `Script::hash` canonicalization and
 * on-chain commitment: public_key[0] = 0x00, bytes [1..33] = Blake3 script hash.
 *
 * Callers must pass a witness-stripped locking script (see lockingView in script_build).
 */

function canonicalizeForP2sh(x) {
  if (x === null) {
    return 'null';
  }
  if (typeof x === 'number' || typeof x === 'boolean') {
    return JSON.stringify(x);
  }
  if (typeof x === 'string') {
    return JSON.stringify(x);
  }
  if (Array.isArray(x)) {
    return '[' + x.map((v) => canonicalizeForP2sh(v)).join(',') + ']';
  }
  if (typeof x === 'object') {
    const keys = Object.keys(x).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeForP2sh(x[k])).join(',') + '}';
  }
  return null;
}

function deriveP2shFromLockingScript(app, lockingScript) {
  const canonical = canonicalizeForP2sh(lockingScript);
  if (!canonical || !app?.crypto?.hash) {
    return { hash: '', address: '' };
  }

  const hash = app.crypto.hash(canonical);
  if (!hash || hash.length !== 64) {
    return { hash: '', address: '' };
  }

  const commitment = Buffer.concat([Buffer.from([0x00]), Buffer.from(hash, 'hex')]);
  return {
    hash,
    address: app.crypto.toBase58(commitment.toString('hex'))
  };
}

module.exports = { deriveP2shFromLockingScript };
