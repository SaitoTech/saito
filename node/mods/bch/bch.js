const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class BCH extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'BCH';
    this.name = 'Bitcoin Cash';
    this.slug = 'bch';
    this.ticker = 'BCH';
    this.description = 'Adds support for Mixin-powered BCH transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // MIXIN STUFF
    this.asset_id = 'fd11b6e3-0b87-41f1-a41f-f0e9b49e5bf0';
    this.chain_id = 'fd11b6e3-0b87-41f1-a41f-f0e9b49e5bf0';
  }

  respondTo(type = '', obj) {
    if (type == 'mixin-crypto') {
      return {
        name: this.name,
        ticker: this.ticker,
        description: this.description,
        asset_id: this.asset_id
      };
    }
    if (type == 'crypto-logo') {
      if (obj?.ticker == this.ticker) {
        return { img: `/bch/img/logo.png` };
      }
    }
    return null;
  }
}

module.exports = BCH;
