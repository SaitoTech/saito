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

		this.dashboard = new Dashboard(this.app, this.mod);
		this.search = new Search(this.app, this.mod);
		this.blocks = new Blocks(this.app, this.mod);
		this.transactions = new Transactions(this.app, this.mod);
	}

	async initialize() {}

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
