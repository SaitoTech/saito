const Teaser = require('./teaser');
const { getSummariesForSale } = require('./summary-cache');

class Teasers {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.app.connection.on('store-listing-updated', (listing) => {
			Teaser.updateMedia(this.app, listing);
		});
	}

	render(container = '', items = null) {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const el = document.querySelector(this.container);
		if (!el) {
			return;
		}

		el.innerHTML = '';

		const list = Array.isArray(items) ? items : getSummariesForSale(this.mod);
		for (const item of list) {
			const teaser = new Teaser(this.app, this.mod, item, this.container);
			teaser.render();
		}
	}
}

module.exports = Teasers;
