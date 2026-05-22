const { resolve_symbol, evaluate_condition } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checkfield(app, opcode, context) {
  const left = resolve_symbol(context, opcode.field);
  let right = resolve_symbol(context, opcode.value);

  if (right === 'NOW' || right === 'now') {
    right = Date.now();
  }

  if (left === undefined || right === undefined) {
    return false;
  }

  return evaluate_condition(left, right, opcode.operator);
}

module.exports = checkfield;
