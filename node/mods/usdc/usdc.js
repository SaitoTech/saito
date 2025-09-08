const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class USDC extends ModTemplate {
	constructor(app) {
		super(app);

		this.appname = 'USDC';
		this.name = 'USDC';
		this.slug = 'usdc';
		this.ticker = 'USDC';
		this.description =
			'Adds support for Mixin-powered ERC20 USD Coin transfers on the Saito Network';
		this.categories = 'Utility Cryptocurrency Finance';

		// MIXIN STUFF
		this.asset_id = '9b180ab6-6abe-3dc0-a13f-04169eb34bfa';
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
					img: `/usdc/img/logo.png`
				};
			}
		}

		return null;
	}
}

module.exports = USDC;
