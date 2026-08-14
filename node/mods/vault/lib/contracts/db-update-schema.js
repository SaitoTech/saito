/**
 * DB_UPDATE_LOGIC — Vault-hardcoded sibling of CHECKPATHHOP inside FILE_SCRIPT.
 *
 * Verifies that a proposed Archive UPDATE is exactly the transition to the
 * instantiated LOAN_SCRIPT:
 *
 *   SETFIELD loan template (Vault-defined, embedded in FILE_SCRIPT)
 *   SETFIELD renter  ← hop.to
 *   SETFIELD expiry  ← hop.value.expires_at  (both NOW comparisons)
 *   SCRIPTHASH instantiated loan_script
 *   AND db.type == UPDATE
 *   AND db contains owner
 *   AND db keys ⊆ { type, owner, updated_at }
 *   AND db.owner == that hash
 *
 * `updated_at` is allowlisted because Archive.updateTransaction always injects it
 * into context.db; it is not a renter-chosen extra field.
 *
 * The LOAN_SCRIPT template is a JSON literal inside this AST (hence inside the
 * FILE_TX access_hash). A renter cannot substitute a different template without
 * breaking hash(FILE_SCRIPT) === archives.owner.
 */

const loan = require('./loan');

/**
 * @param {{ creator_publickey?: string }} opts
 * @returns {object} DB_UPDATE_LOGIC locking-script subtree
 */
function build({ creator_publickey = 'CREATOR_PUBLICKEY_PLACEHOLDER' } = {}) {
  const loan_template = loan.build({ creator_publickey });

  return {
    op: 'AND',
    args: [
      {
        op: 'SETFIELD',
        reference: 'context.loan_script',
        value: loan_template
      },
      {
        op: 'SETFIELD',
        reference: 'context.loan_script.args[0].args[0].publickey',
        value: '__opcodes.checkpathhop.hop.to'
      },
      {
        op: 'SETFIELD',
        reference: 'context.loan_script.args[0].args[1].value',
        value: '__opcodes.checkpathhop.hop.value.expires_at'
      },
      {
        op: 'SETFIELD',
        reference: 'context.loan_script.args[1].args[1].value',
        value: '__opcodes.checkpathhop.hop.value.expires_at'
      },
      {
        op: 'SCRIPTHASH',
        source: 'context.loan_script',
        into: 'hash'
      },
      {
        op: 'CHECKFIELD',
        field: 'db.type',
        operator: '==',
        value: 'UPDATE'
      },
      {
        op: 'CHECKKEY',
        field: 'db',
        operator: '==',
        key: 'owner'
      },
      {
        op: 'CHECKKEY',
        field: 'db',
        operator: 'IN',
        key: ['type', 'owner', 'updated_at']
      },
      {
        op: 'CHECKFIELD',
        field: 'db.owner',
        operator: '==',
        value: '__opcodes.scripthash.hash'
      }
    ]
  };
}

module.exports = {
  id: 'db-update-schema',
  label: 'DB Update Logic',
  description:
    'Vault-hardcoded rule: loan UPDATE may set owner only to hash(instantiated LOAN_SCRIPT).',
  build
};
