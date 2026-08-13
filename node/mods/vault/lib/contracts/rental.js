/**
 * Rental Contract — direct Creator → Renter access constitution.
 *
 * IS_CREATOR (CHECKSENDER)
 * OR (
 *   CHECKPATHHOP selector=LAST where from==CREATOR
 *   AND hop.to == REQUESTER
 *   AND hop.value.timestamp > 0
 *   AND NOW < hop.value.expires_at
 * )
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
  label: 'Rental Contract',
  description:
    'Direct Creator→Renter rental: Creator always allowed; renter allowed via Creator-signed hop until expires_at.',

  /**
   * Editor placeholder (not a finished locking script — call build() to bind keys).
   */
  script: null,

  /**
   * @param {{ creator_publickey?: string }} opts
   * @returns {object} locking script (witness-free; hops merged at unlock)
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
              selector: 'LAST',
              where: [
                {
                  field: 'from',
                  operator: '==',
                  value: creator_publickey
                }
              ],
              publickey: creator_publickey,
              hash: ''
            },
            {
              op: 'CHECKFIELD',
              field: '__opcodes.checkpathhop.hop.to',
              operator: '==',
              value: 'REQUESTER'
            },
            {
              op: 'CHECKFIELD',
              field: '__opcodes.checkpathhop.hop.value.timestamp',
              operator: '>',
              value: 0
            },
            {
              op: 'CHECKFIELD',
              field: 'NOW',
              operator: '<',
              value: '__opcodes.checkpathhop.hop.value.expires_at'
            }
          ]
        }
      ]
    };
  }
};

// Default editor text uses placeholders until build() binds real values.
module.exports.script = module.exports.build();
