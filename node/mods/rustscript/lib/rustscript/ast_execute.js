/**
 * Execute unlocking script (same JSON shape as locking; witness slots materialized on RIGHT).
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
    const args = node.args;

    if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
      const children = Array.isArray(args) ? args : [];
      if (op === 'and') {
        for (const child of children) {
          if (!(await eval_node(child))) {
            return false;
          }
        }
        return true;
      }
      if (op === 'or') {
        for (const child of children) {
          if (await eval_node(child)) {
            return true;
          }
        }
        return false;
      }
      if (op === 'not') {
        if (!children[0]) {
          return true;
        }
        return !(await eval_node(children[0]));
      }
      for (const phase of children) {
        if (!(await eval_node(phase))) {
          return false;
        }
      }
      return true;
    }

    const handler = opcodes[op];
    if (!handler || typeof handler.execute !== 'function') {
      return false;
    }

    const opcodeArgs =
      args && typeof args === 'object' && !Array.isArray(args)
        ? args
        : node.bindings && typeof node.bindings === 'object'
          ? { ...node.bindings }
          : {};

    const nodeWitness = node.witness && typeof node.witness === 'object' ? node.witness : {};
    const execContext = {
      ...context,
      witness: { ...context.witness, ...nodeWitness }
    };

    if (!execContext.__opcodes) {
      execContext.__opcodes = {};
    }

    const script = { op: String(node.op).toUpperCase(), ...opcodeArgs };
    const result = handler.execute(app, script, execContext.witness, execContext);
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

function set_nested_empty(obj, path) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  if (cur[parts[parts.length - 1]] === undefined) {
    cur[parts[parts.length - 1]] = '';
  }
}

function opcode_defaults(handler) {
  if (!handler) {
    return {};
  }
  if (handler.exampleScript && typeof handler.exampleScript === 'object') {
    const script = { ...handler.exampleScript };
    delete script.op;
    return script;
  }
  if (handler.defaults && typeof handler.defaults === 'object') {
    return { ...handler.defaults };
  }
  return {};
}

function witness_fields_for(handler, args) {
  if (!handler) {
    return [];
  }
  if (typeof handler.resolve_witness_fields === 'function') {
    return handler.resolve_witness_fields(args);
  }
  if (handler.exampleWitness && typeof handler.exampleWitness === 'object') {
    return Object.keys(handler.exampleWitness);
  }
  return Array.isArray(handler.witness_fields) ? handler.witness_fields : [];
}

/**
 * Raw parse tree → canonical script JSON (locking or unlocking).
 * unlocking=true adds implicit opcode witness slots from opcode metadata.
 */
ast_execute.materialize = function materialize_script(raw, opcodes, unlocking = false) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }

  const op = String(raw.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const children = Array.isArray(raw.args) ? raw.args : [];
    return {
      op: String(raw.op).toUpperCase(),
      args: children.map((child) => materialize_script(child, opcodes, unlocking))
    };
  }

  const handler = opcodes[op];
  const defaults = opcode_defaults(handler);
  const args = { ...defaults };
  const witness = {};

  const bindings = raw.bindings && typeof raw.bindings === 'object' ? raw.bindings : {};
  const witnessDecl =
    raw.witnessDecl && typeof raw.witnessDecl === 'object' ? raw.witnessDecl : {};

  for (const [key, value] of Object.entries(bindings)) {
    args[key] = value;
  }

  for (const [argName, slot] of Object.entries(witnessDecl)) {
    const slotName = String(slot);
    args[argName] = `context.witness.${slotName}`;
    witness[slotName] = '';
  }

  if (unlocking) {
    for (const field of witness_fields_for(handler, args)) {
      set_nested_empty(witness, field);
    }
  }

  return {
    op: String(raw.op).toUpperCase(),
    args,
    witness
  };
};

/**
 * Locking script → unlocking script (same tree, implicit witness slots filled).
 */
ast_execute.unlocking_from_locking = function unlocking_from_locking(locking, opcodes) {
  if (!locking || typeof locking !== 'object') {
    return locking;
  }

  const op = String(locking.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const children = Array.isArray(locking.args) ? locking.args : [];
    return {
      op: locking.op,
      args: children.map((child) => unlocking_from_locking(child, opcodes))
    };
  }

  const handler = opcodes[op];
  const witness = locking.witness && typeof locking.witness === 'object' ? { ...locking.witness } : {};

  for (const field of witness_fields_for(handler, locking.args)) {
    set_nested_empty(witness, field);
  }

  return {
    op: locking.op,
    args: locking.args && typeof locking.args === 'object' ? { ...locking.args } : {},
    witness
  };
};

ast_execute.validate = function ast_validate(ast) {
  const errors = [];

  function walk(node, path) {
    if (!node || typeof node !== 'object') {
      errors.push({ path, message: 'Expected script object' });
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

    if (!node.args || typeof node.args !== 'object' || Array.isArray(node.args)) {
      errors.push({ path, message: 'Opcode requires "args" object' });
    }
    if (node.witness != null && typeof node.witness !== 'object') {
      errors.push({ path, message: '"witness" must be an object' });
    }
  }

  walk(ast, 'root');
  return { valid: errors.length === 0, errors };
};

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
