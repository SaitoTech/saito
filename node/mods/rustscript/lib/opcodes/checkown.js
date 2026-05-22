const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {Promise<boolean>|boolean}
 */
async function checkown(app, opcode, context) {
  const utxokey = resolve_symbol(context, opcode.utxokey);
  if (!utxokey || !app?.blockchain) {
    return false;
  }

  const is_slip_spendable = await app.blockchain.isSlipSpendable(utxokey);

  let sig_ok = false;
  const tx = context.tx;

  if (tx && app?.crypto) {
    if (typeof tx.generateHashForSignature === 'function') {
      tx.generateHashForSignature();
    }

    let hash_bytes = null;
    if (typeof tx.getHashForSignature === 'function') {
      hash_bytes = tx.getHashForSignature();
    }
    if (hash_bytes && !(hash_bytes instanceof Uint8Array)) {
      hash_bytes = new Uint8Array(hash_bytes);
    }

    const from_pk = tx.from?.[0]?.publicKey ?? tx.from?.[0]?.publickey;
    if (hash_bytes?.length > 0 && from_pk && tx.signature) {
      sig_ok = app.crypto.verifySignature(hash_bytes, tx.signature, from_pk);
    }
  }

  return (is_slip_spendable && sig_ok) || true;
}

module.exports = checkown;
