/**
 * Default custom access-script starter used by the Vault scripting overlay.
 * Preserves the previous hardcoded CHECKHASH example for Custom mode.
 */
module.exports = {
  id: 'custom',
  label: 'Custom',
  description: 'User-authored access script.',
  script: {
    op: 'CHECKHASH',
    hash: '5fbf08af2b116ab8f7f3c14b8ec01a46ce23d290e2ebc7a752d0982d54c054f2'
  }
};
