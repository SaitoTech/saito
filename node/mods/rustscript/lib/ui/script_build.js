/** UI-only: scaffold unlock fields (witness) on the authoritative script object. */

const PLACEHOLDER_PATTERN = /^<([^<>]+)>$/;

function resolveOpcodeDefinition(opcodes, opName) {
  const handler = opcodes?.[String(opName || '').toLowerCase()];
  if (!handler) {
    return null;
  }
  if (handler.opcode && typeof handler.opcode === 'object') {
    return handler.opcode;
  }
  if (handler.name || handler.exampleScript) {
    return handler;
  }
  return null;
}

function lockingView(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(lockingView);
  }
  const out = {};
  for (const key of Object.keys(node)) {
    if (key === 'witness') {
      continue;
    }
    out[key] = lockingView(node[key]);
  }
  return out;
}

const PLACEHOLDER_META = {
  signature: {
    label: 'Signature',
    hint: 'Required signature for this condition',
    action: 'signature'
  },
  signatures: { label: 'Signatures', hint: 'Required signatures (M-of-N)', action: 'text' },
  publickey: {
    label: 'Public key',
    hint: 'Saito public key for this contract field',
    action: 'publickey'
  },
  hash: { label: 'Hash', hint: 'Expected hash digest (Blake3)', action: 'hash' },
  msg: { label: 'Message', hint: 'Message that was signed', action: 'text' },
  text: { label: 'Text', hint: 'Text value for this field', action: 'text' },
  input: { label: 'Input', hint: 'Required preimage to hash', action: 'text' }
};

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value.trim());
}

function placeholderName(value) {
  const match = String(value).trim().match(PLACEHOLDER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function placeholderMeta(value) {
  const name = placeholderName(value);
  if (!name) {
    return null;
  }
  return (
    PLACEHOLDER_META[name] || {
      label: name,
      hint: `Provide value for <${name}>`,
      action: 'text'
    }
  );
}

function isWitnessPath(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return false;
  }
  const witnessIndex = path.indexOf('witness');
  return witnessIndex >= 0 && witnessIndex < path.length - 1;
}

function isWitnessValueSupplied(value) {
  if (value === true || value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string' && (value.trim() === '' || isPlaceholder(value))) {
    return false;
  }
  return true;
}

function unlockFieldNames(opcodes, opName) {
  const witness = resolveOpcodeDefinition(opcodes, opName)?.exampleScript?.witness;
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
    return [];
  }
  return Object.keys(witness);
}

function isWitnessFieldEmbedded(node, fieldKey) {
  const required = node?.required && typeof node.required === 'object' ? node.required : {};
  if (isWitnessValueSupplied(required[fieldKey])) {
    return true;
  }
  const reference = node?.reference && typeof node.reference === 'object' ? node.reference : {};
  return isWitnessValueSupplied(reference[fieldKey]);
}

/** Unlock fields still needed at test time (not embedded in locking required/reference). */
function unlockWitnessFieldNames(opcodes, opName, node) {
  return unlockFieldNames(opcodes, opName).filter((key) => !isWitnessFieldEmbedded(node, key));
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
  const mergedWitness = {};

  for (const key of Object.keys(prevWitness)) {
    if (isWitnessFieldEmbedded(merged, key)) {
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

  if (
    merged.required &&
    typeof merged.required === 'object' &&
    Object.keys(merged.required).length === 0
  ) {
    delete merged.required;
  }

  return apply_witness_scaffold_tree(merged, opcodes);
}

function witnessPlaceholder(opcodes, opName, fieldKey) {
  const example = resolveOpcodeDefinition(opcodes, opName)?.exampleScript?.witness?.[fieldKey];
  if (typeof example === 'string') {
    return example;
  }
  if (Array.isArray(example)) {
    return cloneScript(example);
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
    if (unlockFieldNames(opcodes, op).length > 0) {
      found = true;
    }
  }

  walk(node);
  return found;
}

function cloneScript(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function lockingFromOpcode(opcodes, key) {
  const opDef = resolveOpcodeDefinition(opcodes, key);
  if (!opDef?.exampleScript) {
    return { op: String(key || '').toUpperCase() };
  }
  const script = cloneScript(opDef.exampleScript);
  delete script.witness;
  delete script.required;
  return script;
}

function defaultStarterScript(opcodes) {
  return lockingFromOpcode(opcodes, 'checksig');
}

function getContractTemplates(opcodes) {
  const multisig = lockingFromOpcode(opcodes, 'checkmultisig');
  const multiApproval = cloneScript(multisig);
  if (multiApproval.m !== undefined) {
    multiApproval.m = 3;
  }

  return [
    {
      id: 'shared-wallet',
      name: 'Shared Wallet',
      description: 'Several people must agree before anything moves.',
      locking: multisig
    },
    {
      id: 'secret-vault',
      name: 'Secret Vault',
      description: 'Unlock only when the correct secret is revealed.',
      locking: lockingFromOpcode(opcodes, 'checkhash')
    },
    {
      id: 'timed-release',
      name: 'Timed Release',
      description: 'Funds unlock only after a chosen moment in time.',
      locking: lockingFromOpcode(opcodes, 'checktime')
    },
    {
      id: 'challenge',
      name: 'Challenge Contract',
      description: 'Prove you signed a specific challenge message.',
      locking: (() => {
        const s = lockingFromOpcode(opcodes, 'checksig');
        s.msg = 'challenge: prove you control this rule';
        return s;
      })()
    },
    {
      id: 'tournament-prize',
      name: 'Tournament Prize',
      description: 'Reward must pay a specific winner address.',
      locking: lockingFromOpcode(opcodes, 'checkrecipient')
    },
    {
      id: 'multi-approval',
      name: 'Multi-user Approval',
      description: 'A committee must reach a higher approval threshold.',
      locking: multiApproval
    }
  ];
}

module.exports = {
  isPlaceholder,
  placeholderName,
  placeholderMeta,
  isWitnessPath,
  isWitnessValueSupplied,
  resolveOpcodeDefinition,
  lockingView,
  unlockFieldNames,
  unlockWitnessFieldNames,
  cloneScriptTree,
  preserve_witness_in_tree,
  build_test_script_from_create,
  collectWitnessMissing,
  opcodeTreeNeedsWitness,
  lockingFromOpcode,
  defaultStarterScript,
  getContractTemplates
};
