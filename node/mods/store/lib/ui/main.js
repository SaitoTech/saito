const MainTemplate = require('./main.template');
const Menu = require('./menu');
const Manager = require('./manager');
const NftPickerOverlay = require('./overlays/nft-picker');
const ListingDetailOverlay = require('./overlays/listing-detail');
const PurchaseOverlay = require('./overlays/purchase');
const PurchaseLifecycle = require('./purchase-lifecycle');
const PurchaseStatus = require('./purchase-status');
const ListingLifecycle = require('./listing-lifecycle');
const ListingProgressOverlay = require('./overlays/listing-progress');

class Main {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		if (!this.mod.purchase_lifecycle) {
			this.mod.purchase_lifecycle = new PurchaseLifecycle(app, mod);
		}
		if (!this.mod.listing_lifecycle) {
			this.mod.listing_lifecycle = new ListingLifecycle(app, mod);
		}

		this.menu = new Menu(app, mod, '', (view) => this.onNavigate(view));
		this.manager = new Manager(app, mod, '', {
			onSell: () => this.openSell()
		});
		this.purchase_status = new PurchaseStatus(app, mod, '', {
			onShowProgress: () => this.reopenPurchaseProgress(),
			onViewNfts: () => this.openMyNfts()
		});
		this.nft_picker = null;
		this.listing_detail = null;
		this.purchase_overlay = null;
		this.listing_progress = null;

		// Compatibility aliases for existing callers (store.respondTo, teaser, detail buy).
		this.product_overlay = null;
		this.listing_overlay = null;
		this.purchase_flow = null;

		this.app.connection.on('store-render-listings', () => {
			this.manager.renderListings();
		});

		if (this.app.BROWSER && typeof window !== 'undefined') {
			window.addEventListener('popstate', () => this.onPathChange());
		}
	}

	onPathChange() {
		const storefrontKey = this.mod.returnStorefrontKeyFromPath?.() || '';
		if (storefrontKey) {
			this.openStorefront(storefrontKey, { updateUrl: false });
			return;
		}
		this.manager.show('browse');
		this.menu.setActive('all');
	}

	async initialize() {
		this.nft_picker = new NftPickerOverlay(this.app, this.mod);
		this.listing_detail = new ListingDetailOverlay(this.app, this.mod);
		this.purchase_overlay = new PurchaseOverlay(this.app, this.mod);
		this.listing_progress = new ListingProgressOverlay(this.app, this.mod);
		this.mod.listing_progress = this.listing_progress;

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
		this.manager.render(`${this.container} .store > .main-column > .manager`);
		this.purchase_status.render(`${this.container} .store > .main-column > .purchase-status-slot`);
	}

	onNavigate(view = '') {
		if (view === 'featured') {
			this.manager.show('browse');
			this.setBrowseUrl();
			this.manager.scrollToTop();
			return;
		}

		if (view === 'all') {
			this.manager.show('browse');
			this.setBrowseUrl();
			this.manager.scrollToListings();
			return;
		}

		if (view === 'my-listings') {
			this.openStorefront(this.mod.publicKey);
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

	/**
	 * Open a creator storefront view. Defaults to the logged-in wallet key.
	 * Foundation for public /store/<publickey> storefronts.
	 */
	async openStorefront(publicKey = '', { updateUrl = true } = {}) {
		const key = String(publicKey || this.mod.publicKey || '').trim();
		if (!key) {
			return;
		}

		this.menu.setActive('my-listings');
		await this.manager.showStorefront(key);

		if (updateUrl) {
			this.setStorefrontUrl(key);
		}
	}

	setBrowseUrl() {
		if (!this.app.BROWSER || typeof history === 'undefined') {
			return;
		}
		const path = '/' + (this.mod.returnSlug?.() || 'store');
		if (window.location.pathname !== path) {
			history.pushState({ store: 'browse' }, '', path);
		}
	}

	setStorefrontUrl(publicKey = '') {
		if (!this.app.BROWSER || typeof history === 'undefined' || !publicKey) {
			return;
		}
		const path = this.mod.returnStorefrontPath?.(publicKey);
		if (path && window.location.pathname !== path) {
			history.pushState({ store: 'storefront', publicKey }, '', path);
		}
	}

	reopenPurchaseProgress() {
		const purchase = this.mod.purchase_lifecycle?.returnActivePurchase?.();
		const overlay = this.purchase_overlay;
		if (!purchase || !overlay) {
			return;
		}

		overlay.listingTitle = purchase.title || '';
		overlay.pendingTxSignature = purchase.purchase_tx_signature || '';
		overlay.nft_id = purchase.nft_id || '';
		overlay.quantity = purchase.quantity || 1;

		if (purchase.phase === PurchaseLifecycle.PHASE.COMPLETE) {
			overlay.openComplete();
			return;
		}
		if (purchase.phase === PurchaseLifecycle.PHASE.FULFILLING) {
			overlay.openFulfilling();
			return;
		}
		overlay.openWaiting(purchase.title, purchase.purchase_tx_signature, {
			nft_id: purchase.nft_id,
			quantity: purchase.quantity
		});
	}

	openMyNfts() {
		const active = this.mod.purchase_lifecycle?.returnActivePurchase?.();
		if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
			this.mod.purchase_lifecycle.dismiss(active.id);
		}
		this.purchase_overlay?.hide?.();
		this.app.connection.emit('saito-nft-list-render-request');
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
