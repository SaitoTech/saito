const ModTemplate = require('../../lib/templates/modtemplate');

class BEP extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'BEP';
    this.name = 'BEP';
    this.slug = 'bep';
    this.ticker = 'BEP-SAITO';
    this.description =
      'Adds support for Mixin-powered BEP20-wrapped Saito transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // Mixin BEP20 SAITO on BNB Smart Chain
    this.asset_id = 'f1cf31a2-35e4-3902-860a-9b72de3dc7f8';
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

module.exports = BEP;
