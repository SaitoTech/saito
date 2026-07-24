const Teasers = require('./teasers');
const EmptyPanel = require('./empty-panel');
const { loadSellerInventory } = require('./browse-listings');

class SalesView {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.summaries = [];
		this.loading = false;
		this.loadToken = 0;
		this.teasers = new Teasers(app, mod, '');
		this.empty = new EmptyPanel(app, mod, {
			title: 'No sold listings.',
			body: '',
			actionLabel: '',
			onAction: null
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
			`
    <div class="storefront-admin">
      <section class="catalog storefront-catalog">
        <div class="storefront-status" data-sales-status ${this.loading ? '' : 'hidden'} role="status" aria-live="polite">
          ${
						this.loading
							? `<div class="saito-spinner" aria-hidden="true"></div>
          <p>Loading sold listings…</p>`
							: ''
					}
        </div>
        <div class="teasers" aria-label="Sold listings"></div>
      </section>
    </div>
  `,
			this.container
		);

		this.teasers.container = `${this.container} .teasers`;

		if (this.loading) {
			return;
		}

		this.renderResults();
	}

	/**
	 * @param {import('../summary')[]|null} [summaries] Preloaded sold summaries from warehouse inventory.
	 */
	async show(summaries = null) {
		if (Array.isArray(summaries)) {
			this.summaries = summaries;
			this.loading = false;
			this.render();
			return;
		}

		const seller = String(this.mod.publicKey || '').trim();
		if (!seller) {
			this.summaries = [];
			this.loading = false;
			this.render();
			return;
		}

		this.loading = true;
		const token = ++this.loadToken;
		this.render();

		try {
			const inventory = await loadSellerInventory(this.app, this.mod, seller);
			if (token !== this.loadToken) {
				return;
			}
			this.summaries = inventory.sold || [];
		} catch (err) {
			console.warn('Store: sold listings load failed', err?.message || err);
			if (token !== this.loadToken) {
				return;
			}
			this.summaries = [];
		}

		if (token !== this.loadToken) {
			return;
		}

		this.loading = false;
		this.render();
	}

	renderResults() {
		const status = document.querySelector(`${this.container} [data-sales-status]`);
		if (status) {
			status.hidden = true;
			status.innerHTML = '';
		}

		const teasersEl = document.querySelector(`${this.container} .teasers`);
		if (!teasersEl) {
			return;
		}

		if (!this.summaries.length) {
			teasersEl.innerHTML = '';
			const emptyHost = document.createElement('div');
			emptyHost.className = 'storefront-empty';
			teasersEl.appendChild(emptyHost);
			this.empty.render(`${this.container} .storefront-empty`);
			return;
		}

		this.teasers.render(`${this.container} .teasers`, this.summaries);
	}
}

module.exports = SalesView;
