const MenuTemplate = require('./menu.template');

class Menu {
	constructor(app, mod, container = '', onNavigate = null) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onNavigate = onNavigate;
		this.active = 'all';
		this.storefrontKey = this.mod.publicKey || '';
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const shareUrl = this.returnShareUrl();
		this.app.browser.replaceElementContentBySelector(
			MenuTemplate({ shareUrl }),
			this.container
		);
		this.setActive(this.active);
		this.attachEvents();
	}

	setActive(view = '') {
		this.active = view;
		if (!this.container) {
			return;
		}
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}
		root.querySelectorAll('[data-view]').forEach((item) => {
			const on = item.dataset.view === view;
			item.classList.toggle('active', on);
			item.setAttribute('aria-current', on ? 'page' : 'false');
		});
		this.updateContextControls(root);
	}

	setStorefrontKey(publicKey = '') {
		this.storefrontKey = String(publicKey || this.mod.publicKey || '').trim();
		const root = document.querySelector(this.container);
		if (root) {
			this.updateContextControls(root);
		}
	}

	setStoreView(mode = 'active') {
		const select = document.querySelector(`${this.container} [data-action="store-view"]`);
		if (select) {
			select.value = mode === 'sold' ? 'sold' : 'active';
		}
	}

	activate(item) {
		const view = item.dataset.view || '';
		const category = item.dataset.category != null ? item.dataset.category : undefined;
		this.setActive(view);
		if (typeof this.onNavigate === 'function') {
			this.onNavigate(view, { category });
		}
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('[data-view]').forEach((item) => {
			item.onclick = (e) => {
				e.preventDefault();
				this.activate(item);
			};
			item.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.activate(item);
				}
			};
		});

		const viewSelect = root.querySelector('[data-action="store-view"]');
		if (viewSelect) {
			const navigate = (value) => {
				const view = value === 'sold' ? 'sales' : 'my-listings';
				this.setActive('my-listings');
				if (typeof this.onNavigate === 'function') {
					this.onNavigate(view);
				}
			};
			viewSelect.onchange = (e) => navigate(e.target.value);
			viewSelect.onpointerdown = () => {
				if (this.active !== 'my-listings') {
					navigate(viewSelect.value);
				}
			};
		}

		const storeToggle = root.querySelector('[data-action="toggle-store-view"]');
		if (storeToggle) {
			const navigate = (e) => {
				e.preventDefault();
				const targetView = storeToggle.dataset.targetView || 'all';
				this.setActive(targetView);
				if (typeof this.onNavigate === 'function') {
					this.onNavigate(targetView);
				}
			};
			storeToggle.onclick = navigate;
			storeToggle.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					navigate(e);
				}
			};
		}

		const shareBtn = root.querySelector('[data-action="share-storefront"]');
		if (shareBtn) {
			shareBtn.onclick = async (e) => {
				e.preventDefault();
				const raw = this.returnShareUrl();
				if (!raw) {
					return;
				}

				const mobile =
					window.matchMedia?.('(max-width: 900px)').matches ||
					Number(navigator.maxTouchPoints) > 0;

				if (!mobile || !navigator.share) {
					await this.copyStorefrontUrl(root);
					return;
				}

				try {
					await navigator.share({
						title: 'Saito Store',
						url: raw
					});
				} catch (err) {
					if (err?.name !== 'AbortError') {
						console.warn('Store: share storefront failed', err?.message || err);
					}
				}
			};
		}
	}

	updateContextControls(root) {
		const listingsOpen = this.active === 'my-listings';
		const storeToggle = root.querySelector('[data-action="toggle-store-view"]');
		if (storeToggle) {
			storeToggle.textContent = listingsOpen ? 'Saito Store' : 'My Listings';
			storeToggle.dataset.targetView = listingsOpen ? 'all' : 'my-listings';
		}

		const shareBtn = root.querySelector('[data-action="share-storefront"]');
		if (shareBtn) {
			const label = listingsOpen ? 'Share My Store' : 'Share Saito Store';
			shareBtn.setAttribute('aria-label', label);
			shareBtn.setAttribute('title', label);
		}

		const shareUrl = root.querySelector('[data-storefront-url]');
		if (shareUrl) {
			shareUrl.textContent = this.returnShareUrl();
		}
	}

	returnShareUrl() {
		const publicKey = this.active === 'my-listings' ? this.storefrontKey : '';
		return this.mod.returnStorefrontUrl?.(publicKey) || '';
	}

	async copyStorefrontUrl(root) {
		const raw = this.returnShareUrl();
		if (!raw) {
			return;
		}

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(raw);
			} else {
				const input = document.createElement('input');
				input.value = raw;
				document.body.appendChild(input);
				input.select();
				document.execCommand('copy');
				input.remove();
			}
			if (typeof siteMessage === 'function') {
				siteMessage('Storefront URL copied', 1500);
			}
		} catch (err) {
			console.warn('Store: copy storefront URL failed', err?.message || err);
		}
	}
}

module.exports = Menu;
