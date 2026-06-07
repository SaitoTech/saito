/**
 * Purpose: CHECKMULTISIG opcode — verify M-of-N message signatures.
 */

module.exports = {
  name: 'CHECKMULTISIG',
  description: 'Verify M-of-N signatures',
  exampleScript: {
    op: 'CHECKMULTISIG',
    m: 2,
    publickeys: ['<publickey>', '<publickey>', '<publickey>'],
    msg: 'hello',
    witness: {
      signatures: ['<signature>', '<signature>']
    }
  },
  schema: {
    m: 'number',
    publickeys: 'array:publickey',
    msg: 'text',
    signatures: 'array:signature'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object' || !context || typeof context !== 'object') {
      return false;
    }
    if (!context.app || !context.app.crypto || typeof context.app.crypto.verifyMessage !== 'function') {
      return false;
    }

    const witness = node.witness;
    if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
      return false;
    }

    const signatures = witness.signatures;
    if (!Array.isArray(signatures) || signatures.length === 0) {
      return false;
    }

    const publickeys = node.publickeys;
    if (!Array.isArray(publickeys) || publickeys.length === 0) {
      return false;
    }

    const m = Number(node.m);
    const threshold = Number.isFinite(m) && m > 0 ? m : publickeys.length;
    const msg = typeof node.msg === 'string' ? node.msg : '';

    let valid = 0;
    const used = {};

    for (let s = 0; s < signatures.length; s += 1) {
      const signature = signatures[s];
      if (typeof signature !== 'string' || signature.length === 0) {
        continue;
      }
      for (let p = 0; p < publickeys.length; p += 1) {
        const publickey = publickeys[p];
        if (typeof publickey !== 'string' || used[publickey]) {
          continue;
        }
        if (context.app.crypto.verifyMessage(msg, signature, publickey) === true) {
          used[publickey] = true;
          valid += 1;
          break;
        }
      }
      if (valid >= threshold) {
        return true;
      }
    }

    return valid >= threshold;
  }
};
