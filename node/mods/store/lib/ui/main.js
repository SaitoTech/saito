const MainTemplate = require('./main.template');
const Teasers = require('./teasers');

class Main {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.teasers = new Teasers(this.app, this.mod, '.store-teasers');
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);
		this.teasers.render('.store-teasers');
	}
}

module.exports = Main;
