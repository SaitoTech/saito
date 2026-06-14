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

		const root = document.querySelector(this.container);
		if (root) {
			root.classList.add('store-container');
		}

		this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);
		this.teasers.render('.store-teasers');
		this.attachEvents();
	}

	attachEvents() {
		const sellBtn = document.querySelector('#store-sell-btn');
		if (sellBtn) {
			sellBtn.onclick = (e) => {
				e.preventDefault();
				this.setActiveMenuItem('sell');
			};
		}

		document.querySelectorAll('.store-menu-item').forEach((item) => {
			item.onclick = (e) => {
				e.preventDefault();
				const view = item.dataset.view || '';
				this.setActiveMenuItem(view);

				if (view === 'featured' || view === 'all') {
					this.scrollToListings();
				}
			};
		});
	}

	setActiveMenuItem(view = '') {
		document.querySelectorAll('.store-menu-item').forEach((item) => {
			item.classList.toggle('active', item.dataset.view === view);
		});
	}

	scrollToListings() {
		const listings = document.querySelector('#store-listings');
		if (listings) {
			listings.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}
}

module.exports = Main;
