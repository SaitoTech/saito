/**
 * Purpose: CHECKPATH opcode — verify routing path from authority root.
 */

module.exports = {
  name: 'CHECKPATH',
  description:
    'Verify a routing capability path provided at unlock time, starting from a claimed authority root and bound to a static hash.',
  exampleScript: {
    op: 'CHECKPATH',
    publickey: '<publickey>',
    hash: '<hash (optional)>',
    witness: {
      hops: [
        {
          to: '<publickey>',
          value: '<base64_json_payload>',
          sig: '<signature>'
        }
      ]
    }
  },
  schema: {
    publickey: 'publickey',
    hash: 'hash',
    hops: 'array:hop'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (
      !context.app ||
      !context.app.crypto ||
      typeof context.app.crypto.verifyRoutingPath !== 'function'
    ) {
      return false;
    }

    const start_publickey = node.publickey;
    if (typeof start_publickey !== 'string' || start_publickey.length === 0) {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    const path = witness.hops;
    if (!Array.isArray(path) || path.length === 0) {
      return false;
    }

    const binding_hash = typeof node.hash === 'string' ? node.hash : '';

    return context.app.crypto.verifyRoutingPath(path, start_publickey, binding_hash) === true;
  }
};
