const BaseNft = require('./../../../../lib/saito/ui/saito-nft/nft');
const AuctionSendOverlay = require('./auction-send-overlay');

class AuctionNft extends BaseNft {
  constructor(app, mod, container = '', tx = null) {
    super(app, mod, container, tx);
    // swap the overlay used by the base class
    this.send_overlay = new AuctionSendOverlay(this.app, this.mod);
  }
}

module.exports = AuctionNft;
