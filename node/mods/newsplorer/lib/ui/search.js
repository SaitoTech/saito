const SearchTemplate = require('./search.template');

class Search {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render(container = '') {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(SearchTemplate(), container);
	}
}

module.exports = Search;
