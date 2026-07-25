/**
 * Purpose: CHECKOWNNFTWHERE opcode — NFT ownership and metadata WHERE clauses.
 */

const Slip = require('./../../../../lib/saito/slip').default;

module.exports = {
  name: 'CHECKOWNNFTWHERE',
  description: `
Checks that:
1. The submitted NFT is spendable by the transaction sender (tx.from === slip2.publicKey)
2. Additional WHERE constraints hold over NFT metadata (creator, type)

Required fields:
  utxokey1, utxokey2, utxokey3
`,
  exampleScript: {
    op: 'CHECKOWNNFTWHERE',
    where: [
      {
        field: 'creator',
        operator: '==',
        value: '<publickey>'
      },
      {
        field: 'type',
        operator: '==',
        value: 'stack'
      }
    ],
    witness: {
      utxokey1: '<utxokey1>',
      utxokey2: '<utxokey2>',
      utxokey3: '<utxokey3>'
    }
  },
  schema: {
    where: 'array:clause',
    utxokey1: 'utxokey',
    utxokey2: 'utxokey',
    utxokey3: 'utxokey'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    const utxo1 = witness.utxokey1;
    const utxo2 = witness.utxokey2;
    const utxo3 = witness.utxokey3;
    if (
      typeof utxo1 !== 'string' ||
      utxo1.length === 0 ||
      typeof utxo2 !== 'string' ||
      utxo2.length === 0 ||
      typeof utxo3 !== 'string' ||
      utxo3.length === 0
    ) {
      return false;
    }

    const slip1 = Slip.fromUtxoKey(utxo1);
    const slip2 = Slip.fromUtxoKey(utxo2);
    const slip3 = Slip.fromUtxoKey(utxo3);
    if (!slip1 || !slip2 || !slip3) {
      return false;
    }

    if (!context.__opcodes) {
      context.__opcodes = {};
    }
    context.__opcodes.checkownnftwhere = {
      nft_id: utxo3.substring(0, 66).toLowerCase()
    };

    const tx = context.tx;
    if (tx && Array.isArray(tx.from) && tx.from.length > 0) {
      const sender = tx.from[0].publicKey;
      if (sender !== slip2.publicKey) {
        return false;
      }
    }

    const nft_type =
      context.app && context.app.wallet && typeof context.app.wallet.extractNFTType === 'function'
        ? context.app.wallet.extractNFTType(utxo3)
        : null;
    const creator = slip1.publicKey;

    if (Array.isArray(node.where)) {
      for (let i = 0; i < node.where.length; i += 1) {
        const clause = node.where[i];
        if (!clause || typeof clause !== 'object') {
          return false;
        }

        let lhs;
        if (clause.field === 'creator') {
          lhs = creator;
        } else if (clause.field === 'type') {
          lhs = nft_type;
        } else {
          return false;
        }

        const rhs = clause.value;
        if (clause.operator === '==') {
          if (lhs !== rhs) {
            return false;
          }
        } else if (clause.operator === '!=') {
          if (lhs === rhs) {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    return true;
  }
};
