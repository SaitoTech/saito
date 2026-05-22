const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode - AST node { op: 'checksig', publickey, msg?, signature? }
 * @param {object} context
 * @returns {boolean}
 */
function checksig(app, opcode, context) {
  const publickey = resolve_symbol(context, opcode.publickey);
  const msg = resolve_symbol(context, opcode.msg ?? opcode.message ?? '');
  const signature = resolve_symbol(
    context,
    opcode.signature ?? context.witness?.signature ?? 'witness.signature'
  );

  if (!app?.crypto || !publickey || !signature) {
    return false;
  }

  return app.crypto.verifyMessage(String(msg), String(signature), String(publickey));
}

checksig.witness_fields = ['signature'];

module.exports = checksig;
