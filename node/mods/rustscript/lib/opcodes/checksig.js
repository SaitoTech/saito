/**
 * Purpose: CHECKSIG opcode — verify witness signature against message and publickey.
 */

module.exports = {
  name: 'CHECKSIG',
  description: 'Verify a signature against a message.',
  exampleScript: {
    op: 'CHECKSIG',
    publickey: '<publickey>',
    msg: '<text>',
    witness: {
      signature: '<signature>'
    }
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (
      !context.app ||
      !context.app.crypto ||
      typeof context.app.crypto.verifyMessage !== 'function'
    ) {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(witness, 'signature')) {
      return false;
    }

    const signature = witness.signature;
    if (typeof signature !== 'string' || signature.length === 0) {
      return false;
    }

    const msg = node.msg;
    if (typeof msg !== 'string' || msg.length === 0) {
      return false;
    }

    const publickey = node.publickey;
    if (typeof publickey !== 'string' || publickey.length === 0) {
      return false;
    }

    return context.app.crypto.verifyMessage(msg, signature, publickey) === true;
  }
};
