const { build_test_script_from_create } = require('../script_build');

/** UI-only: sync test panel script from create panel, preserve filled witness fields. */

function materializeUnlockFromScript(lockingScript, currentUnlocking, opcodes) {
  return build_test_script_from_create(lockingScript, currentUnlocking, opcodes);
}

/** Path under execution witness (user-supplied at unlock time). */
function isWitnessPath(path) {
  return Array.isArray(path) && path.length >= 1 && path[0] === 'witness';
}

/** Path under embedded required (part of locking script hash). */
function isEmbeddedRequiredPath(path) {
  return Array.isArray(path) && path.length >= 1 && path[0] === 'required';
}

module.exports = {
  materializeUnlockFromScript,
  isWitnessPath,
  isEmbeddedRequiredPath
};
