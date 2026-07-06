const TransactionTeaserTemplate = require('./transaction-teaser.template');

class TransactionTeaserRow {
	constructor(app, mod, tx) {
		this.app = app;
		this.mod = mod;
		this.tx = tx;
	}

	renderHtml() {
		return TransactionTeaserTemplate(this.tx);
	}
}

module.exports = TransactionTeaserRow;
