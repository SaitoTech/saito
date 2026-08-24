const Base58 = require('base-58');
const secp256k1 = require('secp256k1');

/**
 * Verify the already-hashed Saito transaction signing payload.
 *
 * app.crypto.verifySignature cannot be used here: that public helper hashes
 * its input before verification, while getHashForSignature() already returns
 * the transaction hash. Passing that value through the helper would verify a
 * double hash and reject valid transactions.
 */
function verifyTransactionSignatureHash(tx, signer) {
  if (!tx?.signature || !signer || typeof tx.getHashForSignature !== 'function') return false;

  if (typeof tx.generateHashForSignature === 'function') tx.generateHashForSignature();
  const hash = tx.getHashForSignature();
  if (!(hash instanceof Uint8Array) || hash.length !== 32) return false;

  const signingHash = Buffer.from(hash);
  const signature = Buffer.from(String(tx.signature), 'hex');
  const publicKey = Buffer.from(Base58.decode(String(signer)));
  if (signature.length !== 64 || publicKey.length !== 33) return false;

  return secp256k1.verify(signingHash, signature, publicKey);
}

module.exports = { verifyTransactionSignatureHash };
