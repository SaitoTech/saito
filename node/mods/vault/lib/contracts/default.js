/**
 * Default Vault access script — standard jade-key / NFT-owner gate.
 *
 * Dynamic fields (nftid, utxokeys) are filled by buildDefaultAccessScript().
 * The JSON shape must remain identical to the historical vault.js fallback.
 */
module.exports = {
  id: 'default',
  label: 'Default',
  description: 'Standard Vault access: holder of the Vault Access Key NFT.',
  script: {
    op: 'CHECKOWNNFT',
    nftid: '',
    witness: {
      utxokey1: '',
      utxokey2: '',
      utxokey3: ''
    }
  },

  /**
   * Build the runtime default access-script object.
   * Matches the previous inline construction in vault.js exactly.
   */
  build({ nftid = '', utxokey1 = '', utxokey2 = '', utxokey3 = '' } = {}) {
    return {
      op: 'CHECKOWNNFT',
      nftid,
      witness: {
        utxokey1,
        utxokey2,
        utxokey3
      }
    };
  }
};
