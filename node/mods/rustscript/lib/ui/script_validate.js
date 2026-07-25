/** UI-only structural validation for expert-mode JSON editing. */

function validateScriptStructure(ast, options = {}) {
  const errors = [];
  const forLocking = options.locking === true;

  if (ast === null || ast === undefined) {
    return { valid: false, errors: [{ path: 'root', message: 'Script is missing' }] };
  }

  function walk(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push({ path, message: 'Expected script object' });
      return;
    }

    if (typeof node.op !== 'string' || node.op.length === 0) {
      errors.push({ path, message: 'Missing or empty "op" field' });
      return;
    }

    const op = node.op.toLowerCase();

    if (op === 'and' || op === 'or' || op === 'not' || op === 'then') {
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

    if (node.args !== undefined) {
      errors.push({ path, message: 'Leaf opcode must not have "args"' });
    }

    if (forLocking && node.witness !== undefined) {
      errors.push({
        path,
        message: '"witness" belongs on the test/unlocking script, not the locking script'
      });
    }

    if (node.witness != null && (typeof node.witness !== 'object' || Array.isArray(node.witness))) {
      errors.push({ path, message: '"witness" must be a plain object when present' });
    }

    if (
      node.required != null &&
      (typeof node.required !== 'object' || Array.isArray(node.required))
    ) {
      errors.push({ path, message: '"required" must be a plain object when present' });
    }
  }

  walk(ast, 'root');
  return { valid: errors.length === 0, errors };
}

const {
  isPlaceholder,
  placeholderMeta,
  placeholderName,
  collectWitnessMissing,
  opcodeTreeNeedsWitness
} = require('./script_build');

function pathKeyName(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return '';
  }
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const k = String(path[i]);
    if (!/^\d+$/.test(k)) {
      return k.toLowerCase();
    }
  }
  return String(path[path.length - 1]).toLowerCase();
}

function inferFieldKindFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return 'text';
  }
  const k = pathKeyName(path);
  if (k === 'publickey' || k === 'publickeys') {
    return 'publickey';
  }
  if (k === 'signature' || k === 'signatures') {
    return 'signature';
  }
  if (k === 'hash') {
    return 'hash';
  }
  if (k === 'msg' || k === 'message') {
    return 'message';
  }
  if (k === 'm' || k === 'n' || k === 'threshold' || k === 'count') {
    return 'number';
  }
  if (k === 'op') {
    return 'logical';
  }
  return 'text';
}

function resolveFieldOverlayKind(value, path) {
  const pathArr = Array.isArray(path)
    ? path
    : String(path || '')
        .split('.')
        .filter(Boolean);

  if (typeof value === 'string' && isPlaceholder(value)) {
    const meta = placeholderMeta(value);
    if (meta?.action === 'publickey') {
      return 'publickey';
    }
    if (meta?.action === 'signature') {
      return 'signature';
    }
    if (meta?.action === 'hash') {
      return 'hash';
    }
    const tag = placeholderName(value);
    if (tag === 'msg' || tag === 'message') {
      return 'message';
    }
  }

  if (typeof value === 'number') {
    return 'number';
  }

  const fromPath = inferFieldKindFromPath(pathArr);
  if (fromPath !== 'text') {
    return fromPath;
  }

  if (typeof value === 'string' && isPlaceholder(value)) {
    const tag = placeholderName(value);
    if (tag === 'and' || tag === 'or' || tag === 'not' || tag === 'then') {
      return 'logical';
    }
  }

  if (pathArr.length && String(pathArr[pathArr.length - 1]).toLowerCase() === 'op') {
    const op = String(value || '')
      .trim()
      .toUpperCase();
    if (op === 'AND' || op === 'OR' || op === 'NOT' || op === 'THEN') {
      return 'logical';
    }
  }

  return 'text';
}

function validateField(kind, value, app) {
  if (value === true || value === null || value === undefined) {
    return { valid: true, state: 'empty' };
  }
  const s = String(value).trim();
  if (!s || isPlaceholder(s)) {
    return { valid: true, state: 'empty' };
  }
  switch (kind) {
    case 'publickey': {
      const ok =
        (app?.crypto?.isPublicKey && app.crypto.isPublicKey(s)) ||
        (/^[A-HJ-NP-Za-km-z1-9]+$/.test(s) && s.length >= 40 && s.length <= 50);
      return { valid: ok, state: ok ? 'valid' : 'warn', message: 'Expected a Saito public key' };
    }
    case 'hash': {
      const ok = /^[0-9a-fA-F]{64}$/.test(s);
      return { valid: ok, state: ok ? 'valid' : 'warn', message: 'Expected 64-character hex hash' };
    }
    case 'signature': {
      const ok = /^[0-9a-fA-F]+$/.test(s) && s.length >= 128;
      return { valid: ok, state: ok ? 'valid' : 'warn', message: 'Expected hex signature bytes' };
    }
    case 'number': {
      const ok = /^-?\d+$/.test(s);
      return { valid: ok, state: ok ? 'valid' : 'warn', message: 'Expected an integer' };
    }
    default:
      return { valid: true, state: 'valid' };
  }
}

function isEmptyScript(script) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return true;
  }
  if (!script.op || String(script.op).trim() === '') {
    return true;
  }
  return false;
}

/** Locking script with only an opcode name and no field values yet. */
function isIncompleteOpcodeStub(script) {
  if (isEmptyScript(script)) {
    return false;
  }
  const keys = Object.keys(script).filter((k) => k !== 'witness' && k !== 'required');
  return keys.length === 1 && keys[0] === 'op';
}

function collectPlaceholders(node, path = [], options = {}) {
  const found = [];
  const skipRequired = options.skipRequired === true;
  const skipWitness = options.skipWitness === true;

  function walk(value, currentPath) {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === 'string') {
      if (isPlaceholder(value)) {
        found.push(currentPath.join('.') || '(root)');
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(item, currentPath.concat(String(index)));
      });
      return;
    }
    if (typeof value !== 'object') {
      return;
    }
    for (const key of Object.keys(value)) {
      if (skipRequired && key === 'required') {
        continue;
      }
      if (skipWitness && key === 'witness') {
        continue;
      }
      walk(value[key], currentPath.concat(key));
    }
  }

  walk(node, path);
  return found;
}

function evaluateScriptStatus(lockingScript) {
  if (isEmptyScript(lockingScript)) {
    return { state: 'idle', placeholders: [] };
  }
  if (isIncompleteOpcodeStub(lockingScript)) {
    return {
      state: 'warn',
      placeholders: ['(incomplete)'],
      validation: validateScriptStructure(lockingScript)
    };
  }
  const placeholders = collectPlaceholders(lockingScript, [], {
    skipRequired: true,
    skipWitness: true
  });
  const validation = validateScriptStructure(lockingScript);
  if (!validation.valid || placeholders.length > 0) {
    return { state: 'warn', placeholders, validation };
  }
  return { state: 'ready', placeholders: [], validation };
}

function evaluateRequiredStatus(testScript, execution, opcodes) {
  if (execution?.success === true && opcodeTreeNeedsWitness(testScript, opcodes)) {
    return { state: 'ready', placeholders: [] };
  }
  if (!opcodeTreeNeedsWitness(testScript, opcodes)) {
    return { state: 'idle', placeholders: [] };
  }
  const missing = collectWitnessMissing(testScript, opcodes);
  if (missing.length > 0) {
    return { state: 'warn', placeholders: missing };
  }
  return { state: 'ready', placeholders: [] };
}

function evaluateValidStatus(scriptStatus, requiredStatus, execution) {
  if (scriptStatus.state !== 'ready') {
    return { state: 'idle' };
  }
  if (execution?.success === true) {
    return { state: 'ready' };
  }
  if (requiredStatus.state !== 'ready') {
    return { state: 'warn' };
  }
  if (!execution || !execution.attempted) {
    return { state: 'warn' };
  }
  return { state: 'warn' };
}

function evaluateWorkspaceStatus(lockingScript, unlockingScript, execution, opcodes) {
  return {
    script: evaluateScriptStatus(lockingScript),
    required: evaluateRequiredStatus(unlockingScript, execution, opcodes),
    valid: evaluateValidStatus(
      evaluateScriptStatus(lockingScript),
      evaluateRequiredStatus(unlockingScript, execution, opcodes),
      execution
    )
  };
}

/** Witness stage is satisfied when the script needs no witness fields or all are filled. */
function isWitnessPhaseComplete(unlockingScript, opcodes) {
  if (!opcodeTreeNeedsWitness(unlockingScript, opcodes)) {
    return true;
  }
  return collectWitnessMissing(unlockingScript, opcodes).length === 0;
}

/**
 * Sequential workflow indicator — one derived phase, not three independent booleans.
 *
 * Phases: building_script → script_complete → witness_active → witness_complete
 *         → evaluation_success | evaluation_failed
 */
function deriveWorkflowIndicator({
  lockingScript,
  unlockingScript,
  testingUnlocked,
  execution,
  opcodes,
  validationDisplay
}) {
  const idle = 'idle';
  const ready = 'ready';
  const warn = 'warn';

  const scriptReady = evaluateScriptStatus(lockingScript).state === 'ready';

  if (!scriptReady) {
    return {
      phase: 'building_script',
      script: idle,
      witness: idle,
      valid: idle,
      arrow1: idle,
      arrow2: idle
    };
  }

  if (!testingUnlocked) {
    return {
      phase: 'script_complete',
      script: ready,
      witness: idle,
      valid: idle,
      arrow1: idle,
      arrow2: idle
    };
  }

  if (!isWitnessPhaseComplete(unlockingScript, opcodes)) {
    return {
      phase: 'witness_active',
      script: ready,
      witness: warn,
      valid: idle,
      arrow1: ready,
      arrow2: idle
    };
  }

  const attempted =
    validationDisplay === 'valid' ||
    validationDisplay === 'invalid' ||
    validationDisplay === 'invalid_json' ||
    execution?.attempted === true;

  if (!attempted) {
    return {
      phase: 'witness_complete',
      script: ready,
      witness: ready,
      valid: idle,
      arrow1: ready,
      arrow2: ready
    };
  }

  const success = validationDisplay === 'valid' || execution?.success === true;

  if (success) {
    return {
      phase: 'evaluation_success',
      script: ready,
      witness: ready,
      valid: ready,
      arrow1: ready,
      arrow2: ready
    };
  }

  return {
    phase: 'evaluation_failed',
    script: ready,
    witness: ready,
    valid: warn,
    arrow1: ready,
    arrow2: ready
  };
}

module.exports = {
  validateScriptStructure,
  inferFieldKindFromPath,
  resolveFieldOverlayKind,
  validateField,
  evaluateWorkspaceStatus,
  evaluateScriptStatus,
  deriveWorkflowIndicator,
  isWitnessPhaseComplete,
  collectPlaceholders,
  isEmptyScript
};
