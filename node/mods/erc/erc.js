const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class ERC extends ModTemplate {
	constructor(app) {
		super(app);

		this.appname = 'ERC';
		this.name = 'ERC';
		this.slug = 'erc';
		this.ticker = 'ERC-SAITO';
		this.description =
			'Adds support for Mixin-powered ERC20-wrapped Saito transfers on the Saito Network';
		this.categories = 'Utility Cryptocurrency Finance';

		// MIXIN STUFF
		this.asset_id = '58f18254-8087-3501-b0da-a6a9c15ea808';
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
		return null;
	}
}

module.exports = ERC;
