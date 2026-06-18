const TeasersTemplate = require('./teasers.template');
const Teaser = require('./teaser');

class Teasers {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.app.connection.on('store-listing-updated', (listing) => {
			Teaser.updateMedia(this.app, listing);
		});
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		let targetSelector = this.container;
		if (this.container !== '.store-teasers') {
			this.app.browser.replaceElementContentBySelector(TeasersTemplate(), this.container);
			targetSelector = '.store-teasers';
		} else {
			this.app.browser.replaceElementContentBySelector('', this.container);
		}

		const { getItemsForSale } = require('./listing-cache');
		const items = getItemsForSale(this.mod);
		for (const item of items) {
			const teaser = new Teaser(this.app, this.mod, item, targetSelector);
			teaser.render();
		}
	}
}

module.exports = Teasers;
