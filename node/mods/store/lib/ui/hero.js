const HeroTemplate = require('./hero.template');

class Hero {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onBrowse = callbacks.onBrowse;
		this.onSell = callbacks.onSell;
		this.onStorefront = callbacks.onStorefront;

		this.app.connection.on('store-has-store-updated', () => {
			this.updateOwnerAction();
		});
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			HeroTemplate({ hasStore: this.hasStore() }),
			this.container
		);
		this.attachEvents();
	}

	hasStore() {
		return this.app.options.store?.hasStore === true;
	}

	updateOwnerAction() {
		const button = document.querySelector(`${this.container} [data-action="owner"]`);
		if (button) {
			button.textContent = this.hasStore() ? 'My Listings' : 'Sell Something';
		}
	}

	dismiss() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.classList.add('dissolve');
		setTimeout(() => root.remove(), 220);
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const browseBtn = root.querySelector('[data-action="browse"]');
		if (browseBtn) {
			browseBtn.onclick = (e) => {
				e.preventDefault();
				this.dismiss();
				if (typeof this.onBrowse === 'function') {
					this.onBrowse();
				}
			};
		}

		const ownerBtn = root.querySelector('[data-action="owner"]');
		if (ownerBtn) {
			ownerBtn.onclick = (e) => {
				e.preventDefault();
				this.dismiss();

				if (this.hasStore()) {
					if (typeof this.onStorefront === 'function') {
						this.onStorefront();
					}
					return;
				}

				if (typeof this.onSell === 'function') {
					this.onSell();
				}
			};
		}
	}
}

module.exports = Hero;
