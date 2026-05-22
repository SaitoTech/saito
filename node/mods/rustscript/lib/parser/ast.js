/**
 * AST node helpers for the symbolic script language.
 * Kept minimal for a future Rust port.
 */

function logicalOp(op, args) {
  return { op, args };
}

function thenOp(args) {
  return { op: 'then', args };
}

function notOp(arg) {
  return { op: 'not', args: [arg] };
}

function symbolOp(name) {
  return { op: 'symbol', name: name.toLowerCase() };
}

function opcodeNode(name, params) {
  const node = { op: name.toLowerCase() };
  for (const [key, value] of Object.entries(params)) {
    node[key] = value;
  }
  return node;
}

module.exports = {
  logicalOp,
  thenOp,
  notOp,
  symbolOp,
  opcodeNode
};
