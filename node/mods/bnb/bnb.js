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
    this.asset_id = '1949e683-6a08-49e2-b087-d6b72398588f';
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
    return null;
  }
}

module.exports = BNB;
