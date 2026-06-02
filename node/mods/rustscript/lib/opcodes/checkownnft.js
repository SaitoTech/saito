/**
 * Purpose: CHECKOWNNFT opcode — verify NFT ownership via witness utxokeys.
 */

module.exports = {
  name: 'CHECKOWNNFT',
  description: 'Verify NFT belongs to self via utxokeys',
  exampleScript: {
    op: 'CHECKOWNNFT',
    nftid: '<nftid>',
    witness: {
      utxokey1: '<utxokey1>',
      utxokey2: '<utxokey2>',
      utxokey3: '<utxokey3>'
    }
  },
  schema: {
    nftid: 'string',
    utxokey1: 'utxokey',
    utxokey2: 'utxokey',
    utxokey3: 'utxokey'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const tx = context.tx;
    if (!tx || !Array.isArray(tx.from) || tx.from.length === 0) {
      return false;
    }

    const nftid = node.nftid;
    if (typeof nftid !== 'string' || nftid.length === 0) {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    const utxokey1 = witness.utxokey1;
    const utxokey2 = witness.utxokey2;
    const utxokey3 = witness.utxokey3;
    if (
      typeof utxokey1 !== 'string' ||
      utxokey1.length === 0 ||
      typeof utxokey2 !== 'string' ||
      utxokey2.length === 0 ||
      typeof utxokey3 !== 'string' ||
      utxokey3.length === 0
    ) {
      return false;
    }

    return true;
  }
};
