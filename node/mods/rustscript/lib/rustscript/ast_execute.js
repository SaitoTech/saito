/**
 * Evaluate a canonical AST against an execution context.
 *
 * Input:  ast, context
 * Output: true | false
 *
 * Context is the sole execution environment:
 *   context.app, context.tx, context.block, context.variables, context.opcodes, …
 *
 * Opcodes read and write context. Program data lives on AST nodes.
 * THEN runs phases sequentially because opcodes may mutate context.
 */

function execute(ast, context) {
  if (!context || typeof context !== 'object') {
    return false;
  }

  const opcodes = context.opcodes ?? {};

  function eval_node(node) {
    if (!node || typeof node !== 'object') {
      return false;
    }

    const op = String(node.op || '').toLowerCase();
    const children = Array.isArray(node.args) ? node.args : [];

    if (op === 'and') {
      for (let i = 0; i < children.length; i++) {
        if (!eval_node(children[i])) {
          return false;
        }
      }
      return true;
    }

    if (op === 'or') {
      for (let i = 0; i < children.length; i++) {
        if (eval_node(children[i])) {
          return true;
        }
      }
      return false;
    }

    if (op === 'not') {
      if (children.length === 0) {
        return true;
      }
      return !eval_node(children[0]);
    }

    if (op === 'then') {
      for (let i = 0; i < children.length; i++) {
        if (!eval_node(children[i])) {
          return false;
        }
      }
      return true;
    }

    const handler = opcodes[op];
    if (!handler || typeof handler.execute !== 'function') {
      return false;
    }

    return handler.execute(node, context) === true;
  }

  return eval_node(ast) === true;
}

module.exports = execute;
