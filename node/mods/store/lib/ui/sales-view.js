const SalesViewTemplate = require('./sales-view.template');

class SalesView {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(SalesViewTemplate(), this.container);
	}
}

module.exports = SalesView;
