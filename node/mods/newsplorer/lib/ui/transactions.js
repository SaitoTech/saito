const TransactionsTemplate = require('./transactions.template');

class Transactions {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render(container = '') {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(TransactionsTemplate(), container);
	}
}

module.exports = Transactions;
