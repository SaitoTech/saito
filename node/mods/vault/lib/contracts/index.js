const custom = require('./custom');
const defaultContract = require('./default');
const rental = require('./rental');
const loan = require('./loan');

// Overlay script-type list (advanced editor). Default is the jade-key path,
// not an editor starter — keep Custom / Rental in the UI selector only.
// LOAN_SCRIPT is Vault-internal — never listed here.
const CONTRACTS = [custom, rental];

function listContracts() {
  return CONTRACTS.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description
  }));
}

function getContract(id) {
  if (id === defaultContract.id) {
    return defaultContract;
  }
  return CONTRACTS.find((c) => c.id === id) || null;
}

function getContractScriptJson(id, pretty = true, build_opts = {}) {
  const contract = getContract(id);
  if (!contract) {
    return '';
  }
  const script =
    typeof contract.build === 'function' ? contract.build(build_opts) : contract.script;
  if (!script) {
    return '';
  }
  return pretty ? JSON.stringify(script, null, 2) : JSON.stringify(script);
}

function getDefaultContractId() {
  return custom.id;
}

/**
 * Canonical default Vault access script (CHECKOWNNFT).
 * Used by jade-key mint and standard download request paths.
 */
function buildDefaultAccessScript(opts = {}) {
  return defaultContract.build(opts);
}

/**
 * FILE_TX rental access script: IS_CREATOR OR (CHECKPATHHOP AND DB_UPDATE_LOGIC).
 */
function buildRentalAccessScript(opts = {}) {
  return rental.build(opts);
}

/**
 * DB_UPDATE_LOGIC subtree from the Rental Master Key (not a separate contract).
 */
function buildDbUpdateSchema(opts = {}) {
  return rental.build(opts).args[1].args[1];
}

/**
 * Vault-defined LOAN_SCRIPT template (not an editor contract).
 */
function buildLoanScript(opts = {}) {
  return loan.build(opts);
}

function instantiateLoanScript(opts = {}) {
  return loan.instantiate(opts);
}

module.exports = {
  listContracts,
  getContract,
  getContractScriptJson,
  getDefaultContractId,
  buildDefaultAccessScript,
  buildRentalAccessScript,
  buildDbUpdateSchema,
  buildLoanScript,
  instantiateLoanScript
};
