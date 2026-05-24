const ast_execute = require('../../rustscript/ast_execute');
const { isPlaceholder } = require('./placeholder_utils');

/** UI-only: derive unlock script from authoritative script, preserve witness fills. */

function preserveWitnessValues(previousUnlocking, materialized) {
  if (!materialized || typeof materialized !== 'object') {
    return materialized;
  }

  const next = { ...materialized };
  const prevWitness = previousUnlocking?.witness;
  const nextWitness = materialized?.witness;

  if (!nextWitness || typeof nextWitness !== 'object') {
    return next;
  }

  if (!prevWitness || typeof prevWitness !== 'object') {
    return next;
  }

  const witness = { ...nextWitness };

  for (const key of Object.keys(prevWitness)) {
    const prevVal = prevWitness[key];
    if (prevVal === undefined) {
      continue;
    }
    if (typeof prevVal === 'string' && !isPlaceholder(prevVal)) {
      witness[key] = prevVal;
      continue;
    }
    if (prevVal !== null && typeof prevVal === 'object') {
      witness[key] = JSON.parse(JSON.stringify(prevVal));
    }
  }

  next.witness = witness;
  return next;
}

function materializeUnlockFromScript(lockingScript, currentUnlocking, opcodes) {
  const fresh = ast_execute.unlocking_from_locking(lockingScript, opcodes);
  return preserveWitnessValues(currentUnlocking, fresh);
}

function isWitnessPath(path) {
  return Array.isArray(path) && path.length > 0 && path[0] === 'witness';
}

module.exports = {
  materializeUnlockFromScript,
  preserveWitnessValues,
  isWitnessPath
};
