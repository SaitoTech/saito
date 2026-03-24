const TeasersTemplate = require('./teasers.template');
const Teaser = require('./teaser');

class Teasers {
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

		this.app.browser.replaceElementContentBySelector(TeasersTemplate(), this.container);

		const items = this.mod.getItemsForSale();
		for (const item of items) {
			const teaser = new Teaser(this.app, this.mod, item, '.store-teasers');
			teaser.render();
		}
	}
}

module.exports = Teasers;
