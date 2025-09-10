const NftCreate = require('./overlays/create-overlay');
const NftDisplay = require('./overlays/list-overlay');
const UIModTemplate = require('./../../../templates/uimodtemplate');

/*
  This is a container for all the independent overlays for displaying, creating, sending NFTs in Saito
*/
class SaitoNFT extends UIModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'SaitoNFT';

    //'saito-nft-create-render-request'
    this.create = new NftCreate(app, this);

    //'saito-nft-list-render-request'
    this.display = new NftDisplay(app, this);
  }

  shouldAffixCallbackToModule() {
    return 1;
  }

  /***
   *
   * We can monitor all incoming txs on lite-blocks to see if they are nfts
   *
   */
  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();

    if (txmsg.module == 'NFT') {
      console.log('UI Component SaitoNFT sees a NFT-marked transaction!!!');
      console.log(txmsg);
    }
  }
}

module.exports = SaitoNFT;
