const { build_test_script_from_create } = require('../script_build');

/** UI-only: sync test panel script from create panel, preserve filled required fields. */

function materializeUnlockFromScript(lockingScript, currentUnlocking, opcodes) {
  return build_test_script_from_create(lockingScript, currentUnlocking, opcodes);
}

function isRequiredPath(path) {
  return Array.isArray(path) && path.length > 0 && path[0] === 'required';
}

module.exports = {
  materializeUnlockFromScript,
  isRequiredPath
};
