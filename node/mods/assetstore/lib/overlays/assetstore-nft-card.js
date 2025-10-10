let SaitoNftCard = require('./../../../../lib/saito/ui/saito-nft/nft-card');
let AssetStoreNft = require('./assetstore-nft');


class AssetStoreNftCard extends SaitoNftCard {


  constructor(app, mod, container = '', tx = null, data = null, mycallback = null) {

    super(app, mod, container, tx, data, mycallback);
    this.tx = tx;
    this.nft = new AssetStoreNft(app, mod, tx, data, mycallback, this); // last argument is the card that is rendered
    this.nft.buildNFTData();

  }

}

module.exports = AssetStoreNftCard;

