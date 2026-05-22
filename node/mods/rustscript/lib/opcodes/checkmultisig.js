const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkmultisig(app, opcode, context) {
  const publickeys = opcode.publickeys ?? [];
  const m = Number(opcode.m ?? publickeys.length);
  const msg = resolve_symbol(context, opcode.msg ?? opcode.message ?? '');
  const signatures = opcode.signatures ?? context.witness?.signatures ?? [];

  if (!app?.crypto || !Array.isArray(publickeys) || publickeys.length === 0) {
    return false;
  }
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return false;
  }

  let valid = 0;
  const used = new Set();

  for (const signature of signatures) {
    for (const publickey of publickeys) {
      const pk = resolve_symbol(context, publickey);
      if (used.has(pk)) {
        continue;
      }
      try {
        if (app.crypto.verifyMessage(String(msg), String(signature), String(pk))) {
          used.add(pk);
          valid++;
          break;
        }
      } catch (err) {
        continue;
      }
    }
    if (valid >= m) {
      break;
    }
  }

  return valid >= m;
}

checkmultisig.witness_fields = ['signatures'];

module.exports = checkmultisig;
