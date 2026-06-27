/**
 * Purpose: Execute RustScript AST against runtime context.
 */

function ast_execute(ast, context) {
  if (!ast || typeof ast !== 'object' || !context || typeof context !== 'object') {
    return false;
  }
  if (!context.opcodes || typeof context.opcodes !== 'object') {
    return false;
  }

  const walk = [{ node: ast, visited: false }];
  const values = [];

  while (walk.length > 0) {
    const frame = walk.pop();
    const node = frame.node;

    if (!node || typeof node !== 'object' || typeof node.op !== 'string' || node.op.length === 0) {
      return false;
    }

    const op = node.op;

    if (!frame.visited) {
      walk.push({ node: node, visited: true });

      if (op === 'NOT') {
        if (!Array.isArray(node.args) || node.args.length !== 1) {
          return false;
        }
        walk.push({ node: node.args[0], visited: false });
        continue;
      }

      if (op === 'AND' || op === 'OR' || op === 'THEN') {
        if (!Array.isArray(node.args) || node.args.length < 2) {
          return false;
        }
        for (let i = node.args.length - 1; i >= 0; i -= 1) {
          walk.push({ node: node.args[i], visited: false });
        }
        continue;
      }

      continue;
    }

    if (op === 'NOT') {
      if (values.length < 1) {
        return false;
      }
      const a = values.pop();
      values.push(!a);
      continue;
    }

    if (op === 'AND' || op === 'OR' || op === 'THEN') {
      const argCount = Array.isArray(node.args) ? node.args.length : 0;
      if (values.length < argCount) {
        return false;
      }

      const start = values.length - argCount;

      if (op === 'OR') {
        let result = false;
        for (let i = start; i < values.length; i += 1) {
          if (values[i] === true) {
            result = true;
            break;
          }
        }
        values.length = start;
        values.push(result);
        continue;
      }

      let allTrue = true;
      for (let i = start; i < values.length; i += 1) {
        if (values[i] !== true) {
          allTrue = false;
          break;
        }
      }
      values.length = start;
      values.push(allTrue);
      continue;
    }

    const key = op.toLowerCase();
    const handler = context.opcodes[key];
    if (typeof handler !== 'function') {
      return false;
    }
    values.push(handler(node, context) === true);
  }

  if (values.length !== 1) {
    return false;
  }

  return values[0] === true;
}

module.exports = ast_execute;
