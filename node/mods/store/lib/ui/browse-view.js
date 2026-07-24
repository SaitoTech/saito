const BrowseViewTemplate = require('./browse-view.template');
const CatalogFooterTemplate = require('./catalog-footer.template');
const Hero = require('./hero');
const Teasers = require('./teasers');
const { loadListingsPage } = require('./browse-listings');
const { DEFAULT_PAGE_SIZE } = require('../categories');

class BrowseView {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.hero = new Hero(app, mod, '', { onSell: callbacks.onSell });
		this.teasers = new Teasers(app, mod, '.teasers');

		this.category = '';
		this.page = 1;
		this.page_size = DEFAULT_PAGE_SIZE;
		this.listings = [];
		this.pagination = null;
		this.loading = false;
		this.request_token = 0;
		this.has_loaded = false;
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
		this.teasers.container = `${this.container} .teasers`;
		this.renderCatalog();
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
		this.renderCatalog();
	}

	/**
	 * Fetch a category page from the Store peer and replace the catalog.
	 */
	async loadPage({ category = this.category, page = this.page, scroll = false } = {}) {
		const next_category = String(category || '');
		const next_page = Math.max(1, Number(page) || 1);

		if (this.loading && this.category === next_category && this.page === next_page) {
			return;
		}

		this.category = next_category;
		this.page = next_page;
		const token = ++this.request_token;
		this.loading = true;
		this.showLoading();

		try {
			const result = await loadListingsPage(this.app, this.mod, {
				category: this.category,
				page: this.page,
				page_size: this.page_size
			});

			if (token !== this.request_token) {
				return;
			}

			this.listings = result.listings || [];
			this.pagination = result.pagination || null;
			this.page = this.pagination?.page || this.page;
			this.has_loaded = true;
			this.loading = false;
			this.renderCatalog();

			if (scroll) {
				this.scrollToListings();
			}
		} catch (err) {
			if (token !== this.request_token) {
				return;
			}
			console.warn('Store: browse load failed', err?.message || err);
			this.loading = false;
			this.has_loaded = true;
			this.listings = [];
			this.pagination = {
				page: 1,
				page_size: this.page_size,
				total: 0,
				total_pages: 0,
				has_next: false,
				has_previous: false
			};
			this.renderCatalog();
		}
	}

	showLoading() {
		const status = document.querySelector(`${this.container} [data-catalog-status]`);
		const teasers = document.querySelector(`${this.container} .teasers`);
		const footer = document.querySelector(`${this.container} [data-catalog-footer]`);

		if (status) {
			status.hidden = false;
			status.innerHTML = `
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      `;
		}
		if (teasers) {
			teasers.innerHTML = '';
			teasers.hidden = true;
		}
		if (footer) {
			footer.hidden = true;
			footer.innerHTML = '';
		}
	}

	renderCatalog() {
		const status = document.querySelector(`${this.container} [data-catalog-status]`);
		const teasers = document.querySelector(`${this.container} .teasers`);
		const footer = document.querySelector(`${this.container} [data-catalog-footer]`);

		if (!teasers) {
			return;
		}

		if (this.loading) {
			this.showLoading();
			return;
		}

		if (!this.has_loaded) {
			if (status) {
				status.hidden = false;
				status.innerHTML = `
          <div class="saito-spinner" aria-hidden="true"></div>
          <p>Connecting to Store…</p>
        `;
			}
			if (teasers) {
				teasers.innerHTML = '';
				teasers.hidden = true;
			}
			if (footer) {
				footer.hidden = true;
				footer.innerHTML = '';
			}
			return;
		}

		if (status) {
			status.hidden = true;
			status.innerHTML = '';
		}

		const total = Number(this.pagination?.total ?? this.listings.length);
		const empty = total === 0;

		if (empty) {
			teasers.hidden = true;
			teasers.innerHTML = '';
			if (footer) {
				footer.hidden = false;
				footer.innerHTML = CatalogFooterTemplate({
					empty: true,
					categoryLabel: this.category
				});
			}
			return;
		}

		teasers.hidden = false;
		this.teasers.render(`${this.container} .teasers`, this.listings);

		if (footer) {
			footer.hidden = false;
			footer.innerHTML = CatalogFooterTemplate({
				pagination: this.pagination,
				empty: false,
				categoryLabel: this.category
			});
			this.attachFooterEvents(footer);
		}
	}

	attachFooterEvents(footer) {
		footer.querySelectorAll('[data-page]').forEach((btn) => {
			btn.onclick = (e) => {
				e.preventDefault();
				const page = Number(btn.getAttribute('data-page'));
				if (page && page !== this.page) {
					this.loadPage({ page, scroll: true });
				}
			};
		});

		const prev = footer.querySelector('[data-page-action="prev"]');
		if (prev) {
			prev.onclick = (e) => {
				e.preventDefault();
				if (this.pagination?.has_previous) {
					this.loadPage({ page: this.page - 1, scroll: true });
				}
			};
		}

		const next = footer.querySelector('[data-page-action="next"]');
		if (next) {
			next.onclick = (e) => {
				e.preventDefault();
				if (this.pagination?.has_next) {
					this.loadPage({ page: this.page + 1, scroll: true });
				}
			};
		}
	}
}

module.exports = BrowseView;
