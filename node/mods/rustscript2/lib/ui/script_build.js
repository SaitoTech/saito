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

/** Witness fields still needed at unlock time (not embedded in locking required). */
function unlockWitnessFieldNames(opcodes, opName, node) {
  const embedded =
    node?.required && typeof node.required === 'object' ? node.required : {};
  return witnessFieldNames(opcodes, opName).filter(
    (key) => !isWitnessValueSupplied(embedded[key])
  );
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

function preserve_witness_in_tree(previous, next, opcodes) {
  if (!next || typeof next !== 'object') {
    return next;
  }
  if (!previous || typeof previous !== 'object') {
    return apply_witness_scaffold_tree(next, opcodes);
  }

  const op = String(next.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const prevArgs = Array.isArray(previous.args) ? previous.args : [];
    const nextArgs = Array.isArray(next.args) ? next.args : [];
    return apply_witness_scaffold_tree(
      {
        ...next,
        args: nextArgs.map((child, i) => preserve_witness_in_tree(prevArgs[i], child, opcodes))
      },
      opcodes
    );
  }

  const merged = JSON.parse(JSON.stringify(next));
  const prevWitness =
    previous.witness && typeof previous.witness === 'object' ? previous.witness : {};
  const embeddedRequired =
    merged.required && typeof merged.required === 'object' ? merged.required : {};
  const mergedWitness = {};

  for (const key of Object.keys(prevWitness)) {
    if (isWitnessValueSupplied(embeddedRequired[key])) {
      continue;
    }
    const val = prevWitness[key];
    mergedWitness[key] =
      val !== null && typeof val === 'object' ? JSON.parse(JSON.stringify(val)) : val;
  }

  if (Object.keys(mergedWitness).length > 0) {
    merged.witness = mergedWitness;
  } else {
    delete merged.witness;
  }

  if (merged.required && typeof merged.required === 'object' && Object.keys(merged.required).length === 0) {
    delete merged.required;
  }

  return apply_witness_scaffold_tree(merged, opcodes);
}

function witnessPlaceholder(opcodes, opName, fieldKey) {
  const handler = opcodes?.[String(opName || '').toLowerCase()];
  const example = handler?.exampleRequired?.[fieldKey];
  if (typeof example === 'string') {
    return example;
  }
  if (example !== undefined && example !== null && typeof example !== 'object') {
    return example;
  }
  return `<${fieldKey}>`;
}

function apply_witness_scaffold_tree(node, opcodes) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const op = String(node.op || '').toLowerCase();

  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const children = Array.isArray(node.args) ? node.args : [];
    return {
      ...node,
      args: children.map((child) => apply_witness_scaffold_tree(child, opcodes))
    };
  }

  const fields = unlockWitnessFieldNames(opcodes, op, node);
  if (!fields.length) {
    return node;
  }

  const out = JSON.parse(JSON.stringify(node));
  if (!out.witness || typeof out.witness !== 'object' || Array.isArray(out.witness)) {
    out.witness = {};
  }

  for (const key of fields) {
    if (out.witness[key] === undefined) {
      out.witness[key] = witnessPlaceholder(opcodes, op, key);
    }
  }

  if (Object.keys(out.witness).length === 0) {
    delete out.witness;
  }

  return out;
}

function build_test_script_from_create(createScript, currentTest, opcodes) {
  const fresh = cloneScriptTree(createScript);
  return preserve_witness_in_tree(currentTest, fresh, opcodes);
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

    const witness = n.witness && typeof n.witness === 'object' ? n.witness : {};
    for (const key of unlockWitnessFieldNames(opcodes, op, n)) {
      if (!isWitnessValueSupplied(witness[key])) {
        found.push([...p, 'witness', key].join('.'));
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
  unlockWitnessFieldNames,
  cloneScriptTree,
  preserve_witness_in_tree,
  build_test_script_from_create,
  collectWitnessMissing,
  opcodeTreeNeedsWitness
};
