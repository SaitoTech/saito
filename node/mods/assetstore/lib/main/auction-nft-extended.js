const BaseNft = require('./../../../../lib/saito/ui/saito-nft/nft-card');
const AuctionSendOverlay = require('./auction-send-overlay');

class AuctionNft extends BaseNft {
  constructor(app, mod, container = '', tx = null, data, callback) {
    super(app, mod, container, tx, data, callback);
    // swap the overlay used by the base class
    this.send_overlay = new AuctionSendOverlay(this.app, this.mod);
  }
}

module.exports = AuctionNft;
