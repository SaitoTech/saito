const NftCreate = require('./overlays/create-overlay');
const NftDisplay = require('./overlays/list-overlay');

/*
  This is a container for all the independent overlays for displaying, creating, sending NFTs in Saito
*/
class SaitoNFT {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    //'saito-nft-create-render-request'
    this.create = new NftCreate(app, mod);

    //'saito-nft-list-render-request'
    this.display = new NftDisplay(app, mod);
  }
}

module.exports = SaitoNFT;
