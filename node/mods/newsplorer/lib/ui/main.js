const MainTemplate = require('./main.template');
const Dashboard = require('./dashboard');
const Search = require('./search');
const Blocks = require('./blocks');
const Transactions = require('./transactions');

class Main {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.search = new Search(app, mod);
		this.dashboard = new Dashboard(app, mod);
		this.blocks = new Blocks(app, mod);
		this.transactions = new Transactions(app, mod);
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		const root = document.querySelector(this.container);
		if (root) {
			root.classList.add('newsplorer-container');
		}

		this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);

		this.search.render('.newsplorer-search');
		this.dashboard.render('.newsplorer-dashboard');
		this.blocks.render('.newsplorer-blocks');
		this.transactions.render('.newsplorer-transactions');
	}
}

module.exports = Main;
