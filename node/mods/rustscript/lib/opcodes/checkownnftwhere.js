const Slip = require('../../../../lib/saito/slip').default;
const { resolve_symbol, evaluate_condition } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkownnftwhere(app, opcode, context) {
  const utxo1 = resolve_symbol(context, opcode.utxokey1 ?? 'witness.utxokey1');
  const utxo2 = resolve_symbol(context, opcode.utxokey2 ?? 'witness.utxokey2');
  const utxo3 = resolve_symbol(context, opcode.utxokey3 ?? 'witness.utxokey3');

  if (!utxo1 || !utxo2 || !utxo3) {
    return false;
  }

  const slip1 = Slip.fromUtxoKey(utxo1);
  const slip2 = Slip.fromUtxoKey(utxo2);
  const slip3 = Slip.fromUtxoKey(utxo3);

  if (!slip1 || !slip2 || !slip3) {
    return false;
  }

  context.nft_id = utxo3.substring(0, 66).toLowerCase();

  const tx = context.tx;
  if (tx?.from?.length > 0) {
    const sender = tx.from[0].publicKey ?? tx.from[0].publickey;
    if (sender !== slip2.publicKey) {
      return false;
    }
  }

  const nft_type = app?.wallet?.extractNFTType?.(utxo3) ?? null;
  const creator = slip1.publicKey;

  if (!Array.isArray(opcode.where)) {
    return true;
  }

  for (const clause of opcode.where) {
    let lhs;
    switch (clause.field) {
      case 'creator':
        lhs = creator;
        break;
      case 'type':
        lhs = nft_type;
        break;
      default:
        return false;
    }
    const rhs = resolve_symbol(context, clause.value);
    if (!evaluate_condition(lhs, rhs, clause.operator)) {
      return false;
    }
  }

  return true;
}

checkownnftwhere.witness_fields = ['utxokey1', 'utxokey2', 'utxokey3'];

module.exports = checkownnftwhere;
