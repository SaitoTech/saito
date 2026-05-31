/** UI-only: merge witness values into test scripts (not part of locking script hash). */

const { isPlaceholder } = require('./components/placeholder_utils');

function isWitnessValueSupplied(value) {
  if (value === true || value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string' && (value.trim() === '' || isPlaceholder(value))) {
    return false;
  }
  return true;
}

function witnessFieldNames(opcodes, opName) {
  const handler = opcodes?.[String(opName || '').toLowerCase()];
  if (!handler?.exampleRequired || typeof handler.exampleRequired !== 'object') {
    return [];
  }
  return Object.keys(handler.exampleRequired);
}

function cloneScriptTree(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const op = String(node.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const children = Array.isArray(node.args) ? node.args : [];
    return {
      op: node.op,
      args: children.map((child) => cloneScriptTree(child))
    };
  }

  const out = JSON.parse(JSON.stringify(node));
  delete out.witness;
  return out;
}

function preserve_required_in_tree(previous, next) {
  if (!next || typeof next !== 'object') {
    return next;
  }
  if (!previous || typeof previous !== 'object') {
    return next;
  }

  const op = String(next.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const prevArgs = Array.isArray(previous.args) ? previous.args : [];
    const nextArgs = Array.isArray(next.args) ? next.args : [];
    return {
      ...next,
      args: nextArgs.map((child, i) => preserve_required_in_tree(prevArgs[i], child))
    };
  }

  const merged = JSON.parse(JSON.stringify(next));
  const prevRequired = previous.required;

  if (prevRequired && typeof prevRequired === 'object') {
    if (!merged.required || typeof merged.required !== 'object') {
      merged.required = {};
    }
    for (const key of Object.keys(prevRequired)) {
      const prevVal = prevRequired[key];
      if (isWitnessValueSupplied(prevVal)) {
        merged.required[key] =
          prevVal !== null && typeof prevVal === 'object'
            ? JSON.parse(JSON.stringify(prevVal))
            : prevVal;
      }
    }
    if (Object.keys(merged.required).length === 0) {
      delete merged.required;
    }
  }

  delete merged.witness;
  return merged;
}

function build_test_script_from_create(createScript, currentTest, opcodes) {
  const fresh = cloneScriptTree(createScript);
  return preserve_required_in_tree(currentTest, fresh);
}

function collectWitnessMissing(node, opcodes, path = []) {
  const found = [];

  function walk(n, p) {
    if (!n || typeof n !== 'object') {
      return;
    }

    const op = String(n.op || '').toLowerCase();

    if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
      const children = Array.isArray(n.args) ? n.args : [];
      for (let i = 0; i < children.length; i++) {
        walk(children[i], p.concat(`args[${i}]`));
      }
      return;
    }

    const required = n.required && typeof n.required === 'object' ? n.required : {};
    for (const key of witnessFieldNames(opcodes, op)) {
      if (!isWitnessValueSupplied(required[key])) {
        found.push([...p, 'required', key].join('.'));
      }
    }
  }

  walk(node, path);
  return found;
}

function opcodeTreeNeedsWitness(node, opcodes) {
  let found = false;

  function walk(n) {
    if (!n || typeof n !== 'object' || found) {
      return;
    }
    const op = String(n.op || '').toLowerCase();
    if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
      (n.args || []).forEach(walk);
      return;
    }
    if (witnessFieldNames(opcodes, op).length > 0) {
      found = true;
    }
  }

  walk(node);
  return found;
}

module.exports = {
  isWitnessValueSupplied,
  witnessFieldNames,
  cloneScriptTree,
  preserve_required_in_tree,
  build_test_script_from_create,
  collectWitnessMissing,
  opcodeTreeNeedsWitness
};
