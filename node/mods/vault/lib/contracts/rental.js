/**
 * Rental Contract — Creator always allowed; renter via routing-path hop.
 *
 * IS_CREATOR (CHECKSENDER)
 * OR (
 *   CHECKPATHHOP selector=FIRST where value.delegated==0
 *   AND hop.to == REQUESTER
 *   AND hop.value.timestamp > 0
 *   AND NOW < hop.value.expires_at
 * )
 *
 * The first hop with delegated == 0 is the intended final recipient
 * (direct Creator→Renter, or after any number of delegated intermediaries).
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
    'Creator always allowed; renter is the to-address of the first non-delegated routing hop until expires_at.',

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
