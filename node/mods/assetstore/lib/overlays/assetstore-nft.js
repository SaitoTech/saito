const NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/saito-nft');

class AssetStoreNft extends SaitoNFT {

  constructor(app, mod) {

    super(app, mod, false);

  }



  async fetchTransaction(callback = null) {
    if (!this.id) {
      console.error('Unable to fetch NFT transaction (no nft id found)');
      if (callback) {
        this.tx_fetched = false;
        return callback();
      }
    }

    if (this.tx && this.txmsg && (this.image || this.text)) {
      //
      // Avoiding fetchTransaction (tx, txmsg, img/txt already set);
      //
      if (callback) {
        this.tx_fetched = false;
        return callback();
      }
    }

    await this.app.storage.loadTransactions(
      { field4: this.id },

      async (txs) => {
        if (txs?.length > 0) {
          this.tx = txs[0];
          this.buildNFTData();
          if (callback) {
            this.tx_fetched = true;
            return callback();
          }
        } else {

if (this.app.BROWSER) {
  alert("trying to fetch assetstore tx");
}

        }
      },
      'localhost'
    );

    this.tx_fetched = false;
    return null;
  }




}

module.exports = AssetStoreNft;

