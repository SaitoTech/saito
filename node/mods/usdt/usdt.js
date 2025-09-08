const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class USDT extends ModTemplate {
	constructor(app) {
		super(app);

		this.appname = 'USDT';
		this.name = 'USDT';
		this.slug = 'usdt';
		this.ticker = 'USDT';
		this.description =
			'Adds support for Mixin-powered ERC20 Tether USD transfers on the Saito Network';
		this.categories = 'Utility Cryptocurrency Finance';

		// MIXIN STUFF
		this.asset_id = '4d8c508b-91c5-375b-92b0-ee702ed2dac5';
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
				return {
					img: `/usdt/img/logo.png`
				};
			}
		}

		return null;
	}
}

module.exports = USDT;
