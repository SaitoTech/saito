/**
 * LOAN_SCRIPT — temporary access constitution while a Vault file is out on loan.
 *
 * This is NOT the FILE_SCRIPT. Vault (and FILE_SCRIPT DB_UPDATE_LOGIC) instantiate
 * this template with CHECKPATHHOP-derived renter/expiry, then hash it. That hash
 * is the only legal Archive `owner` for a loan-transition UPDATE.
 *
 * Not an editor-selectable contract.
 *
 *   OR(
 *     AND( CHECKSENDER(renter), NOW < expires_at ),
 *     AND( CHECKSENDER(creator), NOW > expires_at )
 *   )
 *
 * `creator_publickey` is bound when the FILE_SCRIPT is minted.
 * Renter and expires_at are placeholders until SETFIELD copies hop.to / hop.value.expires_at.
 */

module.exports = {
  id: 'loan',
  label: 'Loan Script',
  description: 'Vault-defined loan constitution; instantiated from CHECKPATHHOP, never renter-supplied.',

  RENTER_PLACEHOLDER: 'LOAN_RENTER_PLACEHOLDER',

  /**
   * Bind renter / expiry onto the canonical template.
   * Paths match FILE_SCRIPT DB_UPDATE_LOGIC SETFIELD targets:
   *   args[0].args[0].publickey ← hop.to
   *   args[0].args[1].value     ← hop.value.expires_at
   *   args[1].args[1].value     ← hop.value.expires_at
   * Creator is bound via build({ creator_publickey }) as at FILE_SCRIPT mint.
   *
   * @param {{ creator_publickey: string, renter_publickey: string, expires_at: number }} opts
   * @returns {object}
   */
  instantiate({ creator_publickey, renter_publickey, expires_at } = {}) {
    const script = module.exports.build({ creator_publickey });
    script.args[0].args[0].publickey = renter_publickey;
    script.args[0].args[1].value = expires_at;
    script.args[1].args[1].value = expires_at;
    return script;
  },

  /**
   * @param {{ creator_publickey?: string }} opts
   * @returns {object} LOAN_SCRIPT template (uninstantiated renter/expiry)
   */
  build({ creator_publickey = 'CREATOR_PUBLICKEY_PLACEHOLDER' } = {}) {
    return {
      op: 'OR',
      args: [
        {
          op: 'AND',
          args: [
            {
              op: 'CHECKSENDER',
              publickey: module.exports.RENTER_PLACEHOLDER
            },
            {
              op: 'CHECKFIELD',
              field: 'NOW',
              operator: '<',
              value: 0
            }
          ]
        },
        {
          op: 'AND',
          args: [
            {
              op: 'CHECKSENDER',
              publickey: creator_publickey
            },
            {
              op: 'CHECKFIELD',
              field: 'NOW',
              operator: '>',
              value: 0
            }
          ]
        }
      ]
    };
  }
};

module.exports.script = module.exports.build();
