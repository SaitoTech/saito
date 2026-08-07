/**
 * Purpose: CHECKHASH opcode — verify witness preimage hashes to script hash.
 */

module.exports = {
  name: 'CHECKHASH',
  description: 'Verify that a preimage hashes to a given Blake3 hash.',
  exampleScript: {
    op: 'CHECKHASH',
    hash: '<hash>',
    witness: {
      input: '<secret>'
    }
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (!context.app || !context.app.crypto || typeof context.app.crypto.hash !== 'function') {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(witness, 'input')) {
      return false;
    }

    const input = witness.input;
    if (input === undefined || input === null) {
      return false;
    }
    if (typeof input === 'string' && input.length === 0) {
      return false;
    }

    const hash = node.hash;
    if (typeof hash !== 'string' || hash.length === 0) {
      return false;
    }

    const computed = context.app.crypto.hash(input);
    if (typeof computed !== 'string' || computed.length === 0) {
      return false;
    }

    return computed === hash;
  }
};
