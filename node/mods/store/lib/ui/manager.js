const ManagerTemplate = require('./manager.template');
const BrowseView = require('./browse-view');
const StorefrontView = require('./storefront-view');
const SalesView = require('./sales-view');

class Manager {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.activePanel = 'browse';
		this.onSell = callbacks.onSell;

		this.browse = new BrowseView(app, mod, '', {
			onSell: callbacks.onSell,
			onStorefront: callbacks.onStorefront
		});
		this.storefront = new StorefrontView(app, mod, '', {
			onSell: callbacks.onSell
		});
		this.sales = new SalesView(app, mod, '', {
			onSell: callbacks.onSell
		});
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(ManagerTemplate(), this.container);

		this.browse.render(`${this.container} [data-panel="browse"]`);
		this.storefront.render(`${this.container} [data-panel="my-listings"]`);
		this.sales.render(`${this.container} [data-panel="sales"]`);

		this.show(this.activePanel);
	}

	show(panel = 'browse') {
		this.activePanel = panel || 'browse';

		if (!this.container) {
			return;
		}

		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('[data-panel]').forEach((el) => {
			const match = el.getAttribute('data-panel') === this.activePanel;
			el.classList.toggle('is-active', match);
		});
	}

	/**
	 * Open the creator storefront panel for a public key (My Listings / /store/<pk>).
	 */
	showStorefront(publicKey = '') {
		this.show('my-listings');
		return this.storefront.show(publicKey);
	}

	showSales() {
		this.show('sales');
		this.sales.render(`${this.container} [data-panel="sales"]`);
	}

	scrollToTop() {
		const shell = document.querySelector('.saito-container.store-container');
		if (shell) {
			shell.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
		document.querySelector('.store .hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	scrollToListings() {
		this.browse.scrollToListings();
	}

	renderListings() {
		this.browse.renderListings();
	}

	loadBrowsePage({ category = '', page = 1, scroll = false } = {}) {
		this.show('browse');
		return this.browse.loadPage({ category, page, scroll });
	}

	reloadBrowsePage() {
		if (this.activePanel !== 'browse') {
			return;
		}
		return this.browse.loadPage({
			category: this.browse.category,
			page: this.browse.page,
			scroll: false
		});
	}
}

module.exports = Manager;
