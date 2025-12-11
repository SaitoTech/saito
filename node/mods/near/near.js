const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class NEAR extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'NEAR';
    this.name = 'NEAR';
    this.slug = 'near';
    this.ticker = 'NEAR';
    this.description = 'Adds support for Mixin-powered NEAR transfers on the Saito Network';
    this.categories = 'Utility Cryptocurrency Finance';

    // MIXIN STUFF
    this.asset_id = '97e3c2c1-9967-3a59-9b25-b30bc2045bbb';
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
        return { img: `/near/img/logo.png` };
      }
    }
    return null;
  }
}

module.exports = NEAR;
