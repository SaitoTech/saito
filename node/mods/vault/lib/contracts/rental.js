/**
 * Rental Contract — FILE_TX access script.
 *
 *   IS_CREATOR
 *   OR (
 *     CHECKPATHHOP
 *     AND
 *     DB_UPDATE_LOGIC   ← Vault-hardcoded; sibling of CHECKPATHHOP
 *   )
 *
 * CHECKPATHHOP only validates/selects the critical hop.
 * DB_UPDATE_LOGIC instantiates LOAN_SCRIPT from that hop and requires
 * context.db.owner == hash(instantiated LOAN_SCRIPT).
 *
 * Binding hash is empty for this iteration. FILE_ID is not embedded in the
 * locking script: it is unknown at script-construction time (it is the
 * protected transaction's signature).
 *
 * Pass creator_publickey via build() when Vault creates/displays the contract.
 * Do not leave CREATOR_PUBLICKEY_PLACEHOLDER in scripts shown to the user.
 */

const dbUpdateSchema = require('./db-update-schema');

module.exports = {
  id: 'rental',
  label: 'Rental Contract',
  description:
    'Creator always allowed; otherwise valid rental path AND Vault DB-update constitution.',

  /**
   * Editor placeholder (not a finished locking script — call build() to bind keys).
   */
  script: null,

  /**
   * @param {{ creator_publickey?: string }} opts
   * @returns {object} FILE_TX access script (witness-free; hops merged at unlock)
   */
  build({ creator_publickey = 'CREATOR_PUBLICKEY_PLACEHOLDER' } = {}) {
    return {
      op: 'OR',
      args: [
        {
          op: 'CHECKSENDER',
          publickey: creator_publickey
        },
        {
          op: 'AND',
          args: [
            {
              op: 'CHECKPATHHOP',
              selector: 'FIRST',
              where: [
                {
                  field: 'value.delegated',
                  operator: '==',
                  value: 0
                }
              ],
              publickey: creator_publickey,
              hash: ''
            },
            dbUpdateSchema.build({ creator_publickey })
          ]
        }
      ]
    };
  }
};

// Default editor text uses placeholders until build() binds real values.
module.exports.script = module.exports.build();
