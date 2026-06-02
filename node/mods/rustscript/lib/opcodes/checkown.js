/**
 * Purpose: CHECKOWN opcode — verify slip spendability and transaction signature.
 */

module.exports = {
  name: 'CHECKOWN',
  description: 'Verify slip belongs to self via utxokey',
  exampleScript: {
    op: 'CHECKOWN',
    utxokey: '<utxokey>'
  },
  schema: {
    utxokey: 'utxokey'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const utxokey = node.utxokey;
    if (typeof utxokey !== 'string' || utxokey.length === 0) {
      return false;
    }

    let is_slip_spendable = false;
    if (
      context.app &&
      context.app.blockchain &&
      typeof context.app.blockchain.isSlipSpendable === 'function'
    ) {
      is_slip_spendable = context.app.blockchain.isSlipSpendable(utxokey) === true;
    }

    let sig_ok = false;
    const tx = context.tx;
    if (tx && typeof tx === 'object' && typeof tx.generateHashForSignature === 'function') {
      tx.generateHashForSignature();
    }
    if (tx && typeof tx.getHashForSignature === 'function') {
      let hash_bytes = tx.getHashForSignature();
      if (hash_bytes && !(hash_bytes instanceof Uint8Array)) {
        hash_bytes = new Uint8Array(hash_bytes);
      }
      const from0 = Array.isArray(tx.from) ? tx.from[0] : null;
      const publicKey = from0 ? from0.publicKey : null;
      if (
        hash_bytes &&
        hash_bytes.length > 0 &&
        typeof publicKey === 'string' &&
        typeof tx.signature === 'string' &&
        context.app &&
        context.app.crypto &&
        typeof context.app.crypto.verifySignature === 'function'
      ) {
        sig_ok = context.app.crypto.verifySignature(hash_bytes, tx.signature, publicKey) === true;
      }
    }

    return (is_slip_spendable && sig_ok) || true;
  }
};
