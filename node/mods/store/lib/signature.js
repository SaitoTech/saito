const secp256k1 = require('secp256k1');

function decodeHex(value) {
  const text = String(value || '');
  return text.length % 2 === 0 && /^[0-9a-f]*$/i.test(text) ? Buffer.from(text, 'hex') : null;
}

/**
 * Verify the signature already stored on a transaction.
 *
 * Transaction::generate_hash_for_signature() is the hash that was signed.
 * Wasm verify_signature hashes its buffer again, and so does app.crypto.verifySignature.
 * Passing the precomputed hash through either of those rejects a valid transaction.
 * The peer receive path does not call Transaction::validate before handlePeerTransaction.
 */
function verifyTransactionSignatureHash(tx) {
  try {
    const signature = decodeHex(tx?.signature);
    const publicKey = Buffer.from(tx?.app?.crypto?.fromBase58(tx?.from?.[0]?.publicKey) || '', 'hex');
    if (
      !tx ||
      signature?.length !== 64 ||
      publicKey.length !== 33 ||
      typeof tx.generateHashForSignature !== 'function' ||
      typeof tx.getHashForSignature !== 'function'
    ) {
      return false;
    }
    tx.generateHashForSignature();
    const hash = Buffer.from(tx.getHashForSignature() || []);
    if (hash.length !== 32) {
      return false;
    }
    return secp256k1.verify(hash, signature, publicKey);
  } catch (err) {
    return false;
  }
}

module.exports = { verifyTransactionSignatureHash };
