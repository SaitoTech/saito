/**
 * Rental Contract — FILE_TX access script (Rental Master Key).
 *
 *   IS_CREATOR
 *   OR (
 *     CHECKPATHHOP
 *     AND
 *     DB_UPDATE_LOGIC
 *   )
 *
 * CHECKPATHHOP only validates/selects the critical hop.
 * DB_UPDATE_LOGIC is defined in this file (not a separate contract). It
 * embeds the LOAN_SCRIPT template as a JSON literal, copies hop.to /
 * hop.value.expires_at onto that template, hashes it, and requires
 * context.db.owner == that hash on Archive UPDATE.
 *
 * Binding hash is empty for this iteration. FILE_ID is not embedded in the
 * locking script: it is unknown at script-construction time (it is the
 * protected transaction's signature).
 *
 * Pass creator_publickey via build() when Vault creates/displays the contract.
 * Do not leave CREATOR_PUBLICKEY_PLACEHOLDER in scripts shown to the user.
 */

module.exports = {
  id: 'rental',
  label: 'Rental Master Key',
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
            {
              op: 'AND',
              args: [
                {
                  op: 'SETFIELD',
                  reference: 'context.loan_script',
                  value: {
                    op: 'OR',
                    args: [
                      {
                        op: 'AND',
                        args: [
                          {
                            op: 'CHECKSENDER',
                            publickey: 'LOAN_RENTER_PLACEHOLDER'
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
                  }
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
            }
          ]
        }
      ]
    };
  }
};

// Default editor text uses placeholders until build() binds real values.
module.exports.script = module.exports.build();
