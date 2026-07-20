const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Manager = require('./manager');
const NftPickerOverlay = require('./overlays/nft-picker');
const ListingDetailOverlay = require('./overlays/listing-detail');
const PurchaseOverlay = require('./overlays/purchase');

class Main {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.menu = new Menu(app, mod, '', (view) => this.onNavigate(view));
		this.manager = new Manager(app, mod, '', {
			onSell: () => this.openSell()
		});
		this.nft_picker = null;
		this.listing_detail = null;
		this.purchase_overlay = null;

		// Compatibility aliases for existing callers (store.respondTo, teaser, detail buy).
		this.product_overlay = null;
		this.listing_overlay = null;
		this.purchase_flow = null;

		this.app.connection.on('store-render-listings', () => {
			this.manager.renderListings();
		});
	}

	async initialize() {
		this.nft_picker = new NftPickerOverlay(this.app, this.mod);
		this.listing_detail = new ListingDetailOverlay(this.app, this.mod);
		this.purchase_overlay = new PurchaseOverlay(this.app, this.mod);

		this.nft_picker.onSelect = (nft, defaults) => {
			this.listing_detail.render({ mode: 'edit', nft, defaults });
		};
		this.listing_detail.onBack = (defaults) => {
			this.nft_picker.render(defaults || {});
		};

		this.product_overlay = this.listing_detail;
		this.purchase_flow = this.purchase_overlay;
		this.listing_overlay = {
			render: (defaults = {}) => this.openSell(defaults)
		};
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

		this.menu.render(`${this.container} .store > .menu`);
		this.manager.render(`${this.container} .store > .manager`);
	}

	onNavigate(view = '') {
		if (view === 'featured') {
			this.manager.show('browse');
			this.manager.scrollToTop();
			return;
		}

		if (view === 'all') {
			this.manager.show('browse');
			this.manager.scrollToListings();
			return;
		}

		if (view === 'my-listings') {
			this.manager.show('my-listings');
			return;
		}

		if (view === 'sales') {
			this.manager.show('sales');
			return;
		}

		if (view === 'sell') {
			this.openSell();
		}
	}

	openSell(defaults = {}) {
		this.menu.setActive('sell');

		if (defaults?.nft) {
			this.listing_detail.render({ mode: 'edit', nft: defaults.nft, defaults });
			return;
		}

		this.nft_picker.render(defaults);
	}
}

module.exports = Main;
