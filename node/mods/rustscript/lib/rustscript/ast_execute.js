/**
 * Execute locking script against execution context.
 * @param {object} ast
 * @param {object} execution_context
 * @returns {Promise<{ success: boolean, context: object, witness: object, errors: string[] }>}
 */
async function ast_execute(ast, execution_context) {
  const context = execution_context ?? {};
  const errors = [];

  if (!context.witness || typeof context.witness !== 'object') {
    context.witness = {};
  }

  const app = context.app ?? null;
  const opcodes = context.opcodes ?? {};

  async function eval_node(node) {
    if (!node || typeof node !== 'object') {
      return false;
    }

    const op = String(node.op || '').toLowerCase();
    const args = Array.isArray(node.args) ? node.args : [];

    if (op === 'and') {
      for (const child of args) {
        if (!(await eval_node(child))) {
          return false;
        }
      }
      return true;
    }

    if (op === 'or') {
      for (const child of args) {
        if (await eval_node(child)) {
          return true;
        }
      }
      return false;
    }

    if (op === 'not') {
      if (!args[0]) {
        return true;
      }
      return !(await eval_node(args[0]));
    }

    if (op === 'then') {
      for (const phase of args) {
        if (!(await eval_node(phase))) {
          return false;
        }
      }
      return true;
    }

    const handler = opcodes[op];
    if (typeof handler !== 'function') {
      return false;
    }

    let opcode = { op };
    if (node.bindings && typeof node.bindings === 'object') {
      opcode = { op, ...node.bindings };
    } else {
      for (const key of Object.keys(node)) {
        if (key !== 'op' && key !== 'args' && key !== 'bindings') {
          opcode[key] = node[key];
        }
      }
    }

    const result = handler(app, opcode, context);
    return result instanceof Promise ? await result : !!result;
  }

  try {
    const success = await eval_node(ast);
    return {
      success: !!success,
      context,
      witness: context.witness,
      errors
    };
  } catch (err) {
    errors.push(err.message || String(err));
    return {
      success: false,
      context,
      witness: context.witness,
      errors
    };
  }
}

/**
 * Locking script structure check (no execution).
 */
ast_execute.validate = function ast_validate(ast) {
  const errors = [];

  function walk(node, path) {
    if (!node || typeof node !== 'object') {
      errors.push({ path, message: 'Expected locking script object' });
      return;
    }

    if (typeof node.op !== 'string' || node.op.length === 0) {
      errors.push({ path, message: 'Missing or empty "op" field' });
      return;
    }

    const op = node.op.toLowerCase();

    if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
      if (!Array.isArray(node.args)) {
        errors.push({ path, message: `"${node.op}" requires "args" array` });
        return;
      }
      if (op === 'not' && node.args.length !== 1) {
        errors.push({ path, message: 'NOT requires exactly one argument' });
      }
      if ((op === 'and' || op === 'or') && node.args.length < 2) {
        errors.push({ path, message: `"${node.op}" requires at least two arguments` });
      }
      if (op === 'then' && node.args.length < 2) {
        errors.push({ path, message: 'THEN requires at least two phase arguments' });
      }
      for (let i = 0; i < node.args.length; i++) {
        walk(node.args[i], `${path}.args[${i}]`);
      }
      return;
    }

    if (node.bindings != null && typeof node.bindings !== 'object') {
      errors.push({ path, message: '"bindings" must be an object' });
    }
  }

  walk(ast, 'root');
  return { valid: errors.length === 0, errors };
};

/**
 * Resolve dotted path against context (used by lib/opcodes).
 */
ast_execute.resolve_symbol = function resolve_symbol(context, ref) {
  if (ref === null || ref === undefined) {
    return ref;
  }
  if (typeof ref !== 'string') {
    return ref;
  }

  const parts = ref.split('.');
  if (parts.length === 0) {
    return ref;
  }

  let root = context;
  let start = 0;

  if (parts[0] === 'tx') {
    root = context?.tx;
    start = 1;
  } else if (parts[0] === 'witness') {
    root = context?.witness;
    start = 1;
  } else if (parts[0] === 'blk') {
    root = context?.blk;
    start = 1;
  } else if (parts[0] === 'context') {
    start = 1;
  }

  if (!root || typeof root !== 'object') {
    return ref;
  }

  let cursor = root;
  for (let i = start; i < parts.length; i++) {
    const key = parts[i];
    if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, key)) {
      cursor = cursor[key];
    } else {
      return ref;
    }
  }

  return cursor;
};

/**
 * Compare resolved values (used by lib/opcodes).
 */
ast_execute.evaluate_condition = function evaluate_condition(left, right, operator) {
  const lnum = Number(left);
  const rnum = Number(right);
  const l = Number.isFinite(lnum) && String(left).trim() !== '' ? lnum : left;
  const r = Number.isFinite(rnum) && String(right).trim() !== '' ? rnum : right;
  const op = String(operator || '==').toLowerCase();

  switch (op) {
    case '==':
    case 'equals':
      return l === r;
    case '!=':
    case 'notequals':
      return l !== r;
    case '<':
    case 'lessthan':
      return l < r;
    case '<=':
    case 'lessthanorequal':
      return l <= r;
    case '>':
    case 'greaterthan':
      return l > r;
    case '>=':
    case 'greaterthanorequal':
      return l >= r;
    default:
      return false;
  }
};

module.exports = ast_execute;
