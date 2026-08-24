function uniqueKeys(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))];
}

function returnPolicy(app, modulePublicKey = '') {
  const options = app?.options?.bugs || {};
  return {
    maintainers: uniqueKeys(options.maintainers),
    administrator: options.administrator_publickey || modulePublicKey || '',
    allowedAdders: uniqueKeys(options.allowed_adders),
    requireMaintainerForAdd: options.require_maintainer_for_add === true
  };
}

function isMaintainer(policy, signer) {
  return signer === policy.administrator || policy.maintainers.includes(signer);
}

function canCreateBug(policy, signer, reporter = '') {
  if (!signer) return false;
  if (isMaintainer(policy, signer)) return true;
  if (policy.allowedAdders.includes(signer)) return true;
  if (policy.requireMaintainerForAdd) return false;
  return signer === reporter || policy.allowedAdders.length === 0;
}

function canUpdateBug(_policy, signer, bug) {
  // Mutations are intentionally permissionless; transaction handling verifies
  // the signer's signature before consulting this policy.
  return Boolean(signer && bug);
}

module.exports = { canCreateBug, canUpdateBug, isMaintainer, returnPolicy };
