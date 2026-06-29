const SearchTemplate = require('./search.template');

class Search {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.data = {
			placeholder: 'Search by Address / Txn Hash / Block / Token / Domain Name'
		};
	}

	render(container) {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			SearchTemplate(this.data),
			container
		);
	}
}

module.exports = Search;
