const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkhash(app, opcode, context) {
  const input = resolve_symbol(context, opcode.input ?? 'witness.input');
  const expected = resolve_symbol(context, opcode.hash);

  if (!app?.crypto || !input || !expected) {
    return false;
  }

  return app.crypto.hash(String(input)) === String(expected);
}

checkhash.witness_fields = ['input'];

module.exports = checkhash;
