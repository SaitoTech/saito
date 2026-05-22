const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkpath(app, opcode, context) {
  const start_publickey = resolve_symbol(context, opcode.publickey);
  const binding_hash = resolve_symbol(context, opcode.hash) || '';
  const path = opcode.hops ?? context.witness?.hops;

  if (!app?.crypto || !start_publickey || typeof start_publickey !== 'string') {
    return false;
  }
  if (!Array.isArray(path) || path.length === 0) {
    return false;
  }

  return app.crypto.verifyRoutingPath(path, start_publickey, binding_hash);
}

checkpath.witness_fields = ['hops'];

module.exports = checkpath;
