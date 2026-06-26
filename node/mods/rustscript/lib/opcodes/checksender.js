/**
 * Purpose: CHECKSENDER opcode — verify transaction sender matches script publickey.
 */

module.exports = {
  name: 'CHECKSENDER',
  description: 'Check transaction sender matches supplied publickey.',
  exampleScript: {
    op: 'CHECKSENDER',
    publickey: '<publickey>'
  },
  schema: {
    publickey: 'publickey'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }

    const tx = context.tx;
    if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
      return false;
    }

    const publickey = node.publickey;
    if (typeof publickey !== 'string' || publickey.length === 0) {
      return false;
    }

    const sender = tx.sender;
    if (typeof sender !== 'string' || sender.length === 0) {
      return false;
    }

    return sender.toLowerCase() === publickey.toLowerCase();
  }
};
