const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class ZEC extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'ZEC';
    this.name = 'Zcash Token';
    this.slug = 'zec';
    this.ticker = 'ZEC';
    this.description = 'Adds support for Mixin-powered ZEC transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // MIXIN STUFF
    this.asset_id = '879e4329-a5fc-3181-8c42-7af1859bfc21';
    this.chain_id = '1949e683-6a08-49e2-b087-d6b72398588f';
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
        return { img: `/zec/img/logo.png` };
      }
    }
    return null;
  }
}

module.exports = ZEC;
