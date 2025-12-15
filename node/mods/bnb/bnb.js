const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class BNB extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'BNB';
    this.name = 'BNB';
    this.slug = 'bnb';
    this.ticker = 'BNB';
    this.description = 'Adds support for Mixin-powered BNB transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // MIXIN STUFF
    this.asset_id = '11dbb585-4787-35fb-b1b5-f95ba7de6a3a';
    this.chain_id = '43d61dcd-e413-450d-80b8-101d5e903357';
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
        return { img: `/bnb/img/logo.png` };
      }
    }
    return null;
  }
}

module.exports = BNB;
