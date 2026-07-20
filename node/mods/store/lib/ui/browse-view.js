const BrowseViewTemplate = require('./browse-view.template');
const Hero = require('./hero');
const Teasers = require('./teasers');

class BrowseView {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.hero = new Hero(app, mod, '', { onSell: callbacks.onSell });
		this.teasers = new Teasers(app, mod, '.teasers');
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(BrowseViewTemplate(), this.container);
		this.hero.render(`${this.container} .hero`);
		this.teasers.render(`${this.container} .teasers`);
	}

	scrollToListings() {
		const listings =
			document.querySelector(`${this.container} .catalog`) ||
			document.querySelector(`${this.container} .teasers`) ||
			document.querySelector('.store .catalog');
		if (listings) {
			listings.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	renderListings() {
		this.teasers.render(`${this.container} .teasers`);
	}
}

module.exports = BrowseView;
