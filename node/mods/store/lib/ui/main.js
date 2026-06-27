const MainTemplate = require('./main.template');
const Teasers = require('./teasers');
const ProductOverlay = require('./overlays/product');
const ListingOverlay = require('./overlays/listing');
const PurchaseFlow = require('./overlays/purchase');

class Main {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.teasers = new Teasers(this.app, this.mod, '.store-teasers');
		this.product_overlay = null;
		this.listing_overlay = null;
		this.purchase_flow = null;

		this.app.connection.on('store-render-listings', () => {
			this.teasers.render('.store-teasers');
		});
	}

	async initialize() {
		this.product_overlay = new ProductOverlay(this.app, this.mod);
		this.listing_overlay = new ListingOverlay(this.app, this.mod);
		this.purchase_flow = new PurchaseFlow(this.app, this.mod);
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
				this.listing_overlay.render();
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

				if (view === 'sell') {
					this.listing_overlay.render();
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
