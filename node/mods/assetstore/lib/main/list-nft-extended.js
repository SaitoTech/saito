const BaseNft = require('./../../../../lib/saito/ui/saito-nft/nft');
const ListSendOverlay = require('./list-send-overlay');

class ListNft extends BaseNft {
  constructor(app, mod, container = '', tx = null) {
    super(app, mod, container, tx);
    // swap the overlay used by the base class
    this.send_overlay = new ListSendOverlay(this.app, this.mod);
  }
}

module.exports = ListNft;
