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
    this.chain_id = '11dbb585-4787-35fb-b1b5-f95ba7de6a3a';
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
    return null;
  }
}

module.exports = BNB;
