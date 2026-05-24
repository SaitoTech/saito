const { isPlaceholder } = require('./placeholder_utils');
const ast_execute = require('../../rustscript/ast_execute');

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
  const skipWitness = options.skipWitness === true;
  const witnessOnly = options.witnessOnly === true;

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
      if (skipWitness && key === 'witness') {
        continue;
      }
      walk(value[key], currentPath.concat(key));
    }
  }

  if (witnessOnly) {
    if (node?.witness && typeof node.witness === 'object') {
      walk(node.witness, path.concat('witness'));
    }
    return found;
  }

  walk(node, path);
  return found;
}

function evaluateScriptStatus(lockingScript) {
  if (isEmptyScript(lockingScript)) {
    return { state: 'idle', placeholders: [] };
  }

  const placeholders = collectPlaceholders(lockingScript, [], { skipWitness: true });
  const validation = ast_execute.validate(lockingScript);

  if (!validation.valid || placeholders.length > 0) {
    return { state: 'warn', placeholders, validation };
  }

  return { state: 'ready', placeholders: [], validation };
}

function isEmptyWitness(unlockingScript) {
  if (!unlockingScript || typeof unlockingScript !== 'object') {
    return true;
  }
  const witness = unlockingScript.witness;
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
    return true;
  }
  return Object.keys(witness).length === 0;
}

function evaluateWitnessStatus(unlockingScript) {
  if (isEmptyWitness(unlockingScript)) {
    return { state: 'idle', placeholders: [] };
  }

  const placeholders = collectPlaceholders(unlockingScript, [], { witnessOnly: true });

  if (placeholders.length > 0) {
    return { state: 'warn', placeholders };
  }

  return { state: 'ready', placeholders: [] };
}

function evaluateValidStatus(scriptStatus, witnessStatus, execution) {
  const scriptReady = scriptStatus.state === 'ready';
  const witnessReady = witnessStatus.state === 'ready';

  if (!scriptReady || !witnessReady) {
    return { state: 'idle' };
  }

  if (!execution || !execution.attempted) {
    return { state: 'idle' };
  }

  if (execution.success) {
    return { state: 'ready' };
  }

  return { state: 'warn' };
}

function evaluateWorkspaceStatus(lockingScript, unlockingScript, execution) {
  const script = evaluateScriptStatus(lockingScript);
  const witness = evaluateWitnessStatus(unlockingScript);
  const valid = evaluateValidStatus(script, witness, execution);

  return { script, witness, valid };
}

module.exports = {
  evaluateWorkspaceStatus,
  evaluateScriptStatus,
  evaluateWitnessStatus,
  evaluateValidStatus,
  collectPlaceholders,
  isEmptyScript,
  isEmptyWitness
};
