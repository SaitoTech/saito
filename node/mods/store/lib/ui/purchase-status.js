const PurchaseStatusTemplate = require('./purchase-status.template');
const PurchaseLifecycle = require('./purchase-lifecycle');

/**
 * Lightweight in-page purchase status strip.
 * Mirrors PurchaseLifecycle so closing the overlay does not leave the user without feedback.
 */
class PurchaseStatus {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onShowProgress = callbacks.onShowProgress || null;
		this.onViewNfts = callbacks.onViewNfts || null;

		this.app.connection.on('store-purchase-lifecycle', () => {
			this.render();
		});
	}

	lifecycle() {
		return this.mod.purchase_lifecycle || null;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}
		if (!this.container) {
			return;
		}

		const purchase = this.lifecycle()?.returnActivePurchase?.() || null;
		const el = document.querySelector(this.container);
		if (!el) {
			return;
		}

		el.innerHTML = PurchaseStatusTemplate(purchase);
		this.attachEvents();
	}

	attachEvents() {
		const root = document.querySelector(`${this.container} [data-purchase-status]`);
		if (!root || root.hidden) {
			return;
		}

		root.querySelector('[data-action="view-nfts"]')?.addEventListener('click', (e) => {
			e.preventDefault();
			if (typeof this.onViewNfts === 'function') {
				this.onViewNfts();
				return;
			}
			const active = this.lifecycle()?.returnActivePurchase?.();
			if (active?.phase === PurchaseLifecycle.PHASE.COMPLETE) {
				this.lifecycle()?.dismiss(active.id);
			}
			this.app.connection.emit('saito-nft-list-render-request');
		});

		root.querySelector('[data-action="dismiss"]')?.addEventListener('click', (e) => {
			e.preventDefault();
			const active = this.lifecycle()?.returnActivePurchase?.();
			if (active) {
				this.lifecycle()?.dismiss(active.id);
			}
		});

		root.querySelector('[data-action="show-progress"]')?.addEventListener('click', (e) => {
			e.preventDefault();
			if (typeof this.onShowProgress === 'function') {
				this.onShowProgress();
			}
		});
	}
}

module.exports = PurchaseStatus;
