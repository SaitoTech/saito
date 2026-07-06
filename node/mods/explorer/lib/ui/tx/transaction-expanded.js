const TransactionExpandedTemplate = require('./transaction-expanded.template');

class TransactionExpanded {
	constructor(app, mod, tx) {
		this.app = app;
		this.mod = mod;
		this.tx = tx;
	}

	renderHtml() {
		return TransactionExpandedTemplate(this.tx);
	}
}

module.exports = TransactionExpanded;
