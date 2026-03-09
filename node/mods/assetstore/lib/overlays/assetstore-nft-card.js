let SaitoNFTCard = require('./../../../../lib/saito/ui/saito-nft/saito-nft-card');
let AssetStoreNFTCardTemplate = require('./assetstore-nft-card.template');
let AssetStoreNFT = require('./assetstore-nft');

class AssetStoreNFTCard extends SaitoNFTCard {
  constructor(app, mod, container = '', tx = null, data = null, mycallback = null) {
    super(app, mod, container, tx, data, mycallback);
    this.nft = new AssetStoreNFT(app, mod, tx, data);
    this.template = AssetStoreNFTCardTemplate;
    this.my_qs = this.container + ` #nft-listing-${this.nft.tx_sig}`;
  }
}

module.exports = AssetStoreNFTCard;
