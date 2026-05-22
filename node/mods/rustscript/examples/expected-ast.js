/**
 * Expected AST shapes (reference outputs for the examples in scripts.js).
 */

module.exports = {
  simple_and: {
    op: 'and',
    args: [{ op: 'symbol', name: 'a' }, { op: 'symbol', name: 'b' }]
  },

  temporal: {
    op: 'then',
    args: [
      {
        op: 'and',
        args: [{ op: 'symbol', name: 'a' }, { op: 'symbol', name: 'b' }]
      },
      { op: 'symbol', name: 'c' }
    ]
  },

  importfield: {
    op: 'importfield',
    field: 'tx.to',
    as: 'recipient'
  },

  checksig: {
    op: 'checksig',
    publickey: 'alice'
  }
};
