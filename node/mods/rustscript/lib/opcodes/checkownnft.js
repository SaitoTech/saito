const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkownnft(app, opcode, context) {
  const tx = context.tx;
  const sender = tx?.from?.[0]?.publicKey ?? tx?.from?.[0]?.publickey;
  if (!sender) {
    return false;
  }

  const nftid = resolve_symbol(context, opcode.nftid);
  const utxokey1 = resolve_symbol(context, opcode.utxokey1 ?? 'witness.utxokey1');
  const utxokey2 = resolve_symbol(context, opcode.utxokey2 ?? 'witness.utxokey2');
  const utxokey3 = resolve_symbol(context, opcode.utxokey3 ?? 'witness.utxokey3');

  if (!nftid || !utxokey1 || !utxokey2 || !utxokey3) {
    return false;
  }

  return true;
}

checkownnft.witness_fields = ['utxokey1', 'utxokey2', 'utxokey3'];

module.exports = checkownnft;
