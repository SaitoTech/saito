const TransactionTemplate = require('./transaction.template');

class Transaction {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render() {}
}

module.exports = Transaction;
