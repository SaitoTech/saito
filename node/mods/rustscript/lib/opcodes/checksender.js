const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checksender(app, opcode, context) {
  const required = resolve_symbol(context, opcode.publickey);
  if (!required) {
    return false;
  }

  const sender =
    resolve_symbol(context, 'tx.sender') ??
    context.tx?.sender ??
    context.tx?.from?.[0]?.publicKey ??
    context.tx?.from?.[0]?.publickey ??
    null;

  if (!sender) {
    return false;
  }

  return String(sender).toLowerCase() === String(required).toLowerCase();
}

module.exports = checksender;
