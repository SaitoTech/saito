const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function sumfields(app, opcode, context) {
  const left = resolve_symbol(context, opcode.a);
  const right = resolve_symbol(context, opcode.b);
  const key = opcode.into ?? opcode.as;

  if (left === undefined || right === undefined || !key) {
    return false;
  }

  const l = Number(left);
  const r = Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) {
    return false;
  }

  if (typeof key !== 'string' || !/^[a-zA-Z0-9_]+$/.test(key)) {
    return false;
  }

  context[key] = l + r;
  return true;
}

module.exports = sumfields;
