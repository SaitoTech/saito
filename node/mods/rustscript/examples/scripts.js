/**
 * Example symbolic scripts for manual / automated parser checks.
 */

module.exports = {
  simple_and: 'A AND B',

  temporal: '(A AND B) THEN C',

  nested_then: '((A THEN B) AND (C THEN D)) THEN (E AND F)',

  checksig: 'CHECKSIG[publickey="alice"]',

  importfield: 'IMPORTFIELD[field=tx.to AS recipient]',

  checksig_witness: `CHECKSIG[
    publickey=context.recipient,
    signature=witness.sig
  ]`,

  complex: `(
    IMPORTFIELD[field=tx.to AS recipient]
    AND
    CHECKSIG[publickey="alice"]
)
THEN
(
    CHECKRECIPIENT[publickey=context.recipient]
)`
};
