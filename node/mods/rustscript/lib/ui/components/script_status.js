const { isPlaceholder } = require('./placeholder_utils');
const { validateScriptStructure } = require('../script_validate');
const {
  collectWitnessMissing,
  opcodeTreeNeedsWitness,
  isWitnessValueSupplied
} = require('../script_build');

/** UI-only lifecycle status — does not change runtime behavior. */

function isEmptyScript(script) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return true;
  }
  const keys = Object.keys(script);
  if (keys.length === 0) {
    return true;
  }
  if (!script.op || String(script.op).trim() === '') {
    return true;
  }
  return false;
}

function collectPlaceholders(node, path = [], options = {}) {
  const found = [];
  const skipRequired = options.skipRequired === true;

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

  const placeholders = collectPlaceholders(lockingScript, [], { skipRequired: true });
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
  const scriptReady = scriptStatus.state === 'ready';

  if (!scriptReady) {
    return { state: 'idle' };
  }

  if (execution?.success === true) {
    return { state: 'ready' };
  }

  const requiredReady = requiredStatus.state === 'ready';

  if (!requiredReady) {
    return { state: 'warn' };
  }

  if (!execution || !execution.attempted) {
    return { state: 'warn' };
  }

  return { state: 'warn' };
}

function evaluateWorkspaceStatus(lockingScript, unlockingScript, execution, opcodes) {
  const script = evaluateScriptStatus(lockingScript);
  const required = evaluateRequiredStatus(unlockingScript, execution, opcodes);
  const valid = evaluateValidStatus(script, required, execution);

  return { script, required, valid };
}

module.exports = {
  evaluateWorkspaceStatus,
  evaluateScriptStatus,
  evaluateRequiredStatus,
  evaluateValidStatus,
  collectPlaceholders,
  isEmptyScript,
  isWitnessValueSupplied
};
