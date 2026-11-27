const secp256k1 = require('secp256k1');

/**
 * Confirm the transaction was signed by its from-slip.
 *
 * The peer path does not validate the transaction, and the deserialized
 * transaction has no crypto object. The sender key is decoded with
 * app.crypto.fromBase58. app.crypto.verifySignature hashes its input, while
 * getHashForSignature() is already the digest the wallet signed, so that
 * digest is checked directly.
 *
 * Returns the verified sender public key, or an empty string.
 */
function verifyTransactionSender(app, tx) {
  try {
    const signer = String(tx?.from?.[0]?.publicKey || '').trim();
    if (
      !signer ||
      !tx?.signature ||
      typeof app?.crypto?.fromBase58 !== 'function' ||
      typeof tx.getHashForSignature !== 'function'
    ) {
      return '';
    }
    if (typeof tx.generateHashForSignature === 'function') {
      tx.generateHashForSignature();
    }
    const hash = Buffer.from(tx.getHashForSignature() || []);
    const signature = Buffer.from(String(tx.signature), 'hex');
    const publicKey = Buffer.from(app.crypto.fromBase58(signer), 'hex');
    if (hash.length !== 32 || signature.length !== 64 || publicKey.length !== 33) {
      return '';
    }
    if (secp256k1.verify(hash, signature, publicKey) !== true) {
      return '';
    }
    if (typeof tx.isFrom === 'function' && tx.isFrom(signer) !== true) {
      return '';
    }
    return signer;
  } catch (err) {
    return '';
  }
}

module.exports = { verifyTransactionSender };
