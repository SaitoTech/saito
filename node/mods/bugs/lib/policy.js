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

function canUpdateBug(policy, signer, bug) {
  if (!signer || !bug) return false;
  if (isMaintainer(policy, signer)) return true;
  if (signer === bug.added_by_publickey) return true;
  return bug.reporter_verified === 1 && signer === bug.reporter_publickey;
}

module.exports = { canCreateBug, canUpdateBug, isMaintainer, returnPolicy };
