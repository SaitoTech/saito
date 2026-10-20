const SaitoNFTCard = require('../../../../lib/saito/ui/saito-nft/saito-nft-card');
const RedemptionCardTemplate = require('./redemption-card.template');

class RedemptionCard extends SaitoNFTCard {
  constructor(app, mod, container, data, claim, callback) {
    super(app, mod, container, null, data, callback);
    this.claim = claim;
    this.template = (app, mod, nft) => RedemptionCardTemplate(app, mod, nft, this.claim);
  }
}

module.exports = RedemptionCard;
