const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class XMR extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'XMR';
    this.name = 'Monero';
    this.slug = 'xmr';
    this.ticker = 'XMR';
    this.description = 'Adds support for Mixin-powered XMR transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // MIXIN STUFF
    this.asset_id = '05c5ac01-31f9-4a69-aa8a-ab796de1d041';
    this.chain_id = '05c5ac01-31f9-4a69-aa8a-ab796de1d041';
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
        return { img: `/xmr/img/logo.png` };
      }
    }
    return null;
  }
}

module.exports = XMR;
