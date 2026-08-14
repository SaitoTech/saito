/**
 * Vault-controlled DB_UPDATE_SCHEMA — constitutional Archive mutation rules.
 *
 * NOT a user/renter-editable contract. Embedded into the FILE_TX access script
 * by rental.build() as the sibling of CHECKPATHHOP under AND.
 *
 *   OR(
 *     AND( RENTER, NOW < expires_at, CHECKKEY db != owner ),
 *     AND( CREATOR, NOW > expires_at )
 *   )
 *
 * RENTER  = hop.to == REQUESTER (from CHECKPATHHOP)
 * CREATOR = CHECKSENDER(creator_publickey)
 * expires_at = __opcodes.checkpathhop.hop.value.expires_at
 */

/**
 * @param {{ creator_publickey?: string }} opts
 * @returns {object} DB_UPDATE_SCHEMA locking-script subtree
 */
function build({ creator_publickey = 'CREATOR_PUBLICKEY_PLACEHOLDER' } = {}) {
  return {
    op: 'OR',
    args: [
      {
        op: 'AND',
        args: [
          {
            op: 'CHECKFIELD',
            field: '__opcodes.checkpathhop.hop.to',
            operator: '==',
            value: 'REQUESTER'
          },
          {
            op: 'CHECKFIELD',
            field: 'NOW',
            operator: '<',
            value: '__opcodes.checkpathhop.hop.value.expires_at'
          },
          {
            op: 'CHECKKEY',
            field: 'db',
            operator: '!=',
            key: 'owner'
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
            value: '__opcodes.checkpathhop.hop.value.expires_at'
          }
        ]
      }
    ]
  };
}

module.exports = {
  id: 'db-update-schema',
  label: 'DB Update Schema',
  description:
    'Vault-hardcoded constitutional rules for Archive updates under a rental path.',
  build
};
