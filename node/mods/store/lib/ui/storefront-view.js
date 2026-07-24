const StorefrontViewTemplate = require('./storefront-view.template');
const { OWN_STORE_DESCRIPTION } = require('./sales-view');
const Teasers = require('./teasers');
const EmptyPanel = require('./empty-panel');
const {
	loadListingTransactionsForSeller,
	summariesFromListingTransactions
} = require('../archive');

class StorefrontView {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onSell = callbacks.onSell;
		this.onViewChange = callbacks.onViewChange;
		this.publicKey = '';
		this.summaries = [];
		this.loading = false;
		this.loadToken = 0;

		this.teasers = new Teasers(app, mod, '');
		this.empty = new EmptyPanel(app, mod, {
			title: 'No listings yet',
			body: 'Items you put up for sale will appear here.',
			actionLabel: 'Add New Listing',
			onAction: () => this.onSell?.()
		});

		this.app.connection.on('store-listing-lifecycle', (entry) => {
			if (!this.publicKey || !this.container) {
				return;
			}

			if (
				entry?.phase === 'complete' &&
				entry.summary &&
				this.isOwnStorefront()
			) {
				const sig = entry.listing_signature || '';
				const idx = this.summaries.findIndex(
					(s) =>
						(sig && s.listing_signature === sig) ||
						(s.nft_id === entry.nft_id && Number(s.price) === Number(entry.price))
				);
				if (idx >= 0) {
					this.summaries[idx] = entry.summary;
				} else {
					this.summaries.unshift(entry.summary);
				}
			}

			if (this.loading) {
				// Archive may still be loading — still show pending / just-confirmed cards.
				this.renderTeasersOnly();
				return;
			}

			this.renderResults();
		});
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const isOwn = this.isOwnStorefront();
		const rawTitle = isOwn
			? 'Your Store'
			: this.app.keychain?.returnUsername?.(this.publicKey) || 'Store';
		const shareUrl = this.publicKey ? this.mod.returnStorefrontUrl?.(this.publicKey) || '' : '';

		this.app.browser.replaceElementContentBySelector(
			StorefrontViewTemplate({
				title: this.escapeHtml(rawTitle),
				description: isOwn ? OWN_STORE_DESCRIPTION : '',
				shareUrl: this.escapeHtml(shareUrl),
				loading: !!this.publicKey && this.loading,
				showCopy: isOwn && !!shareUrl,
				showViewSelect: isOwn,
				activeView: 'active'
			}),
			this.container
		);

		this.teasers.container = `${this.container} .teasers`;
		this.attachHeaderEvents(shareUrl);

		if (!this.publicKey) {
			return;
		}

		if (this.loading) {
			// Pending shims should appear immediately under the progress overlay.
			this.renderTeasersOnly();
			return;
		}

		this.renderResults();
	}

	attachHeaderEvents(shareUrl = '') {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const copyBtn = root.querySelector('[data-action="copy-url"]');
		if (copyBtn) {
			copyBtn.onclick = async (e) => {
				e.preventDefault();
				const urlEl = root.querySelector('[data-storefront-url]');
				const raw = (urlEl?.textContent || shareUrl || '').trim();
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
			};
		}

		const viewSelect = root.querySelector('[data-action="store-view"]');
		if (viewSelect) {
			viewSelect.onchange = (e) => {
				const mode = e.target.value === 'sold' ? 'sold' : 'active';
				if (typeof this.onViewChange === 'function') {
					this.onViewChange(mode);
				}
			};
		}
	}

	/**
	 * Show a creator storefront for the given public key.
	 * Renders the shell immediately, then loads archive listings asynchronously.
	 */
	async show(publicKey = '') {
		const nextKey = String(publicKey || '').trim();
		if (!nextKey) {
			return;
		}

		this.publicKey = nextKey;
		this.summaries = [];
		this.loading = true;
		const token = ++this.loadToken;

		this.render();

		try {
			const txs = await loadListingTransactionsForSeller(this.app, this.publicKey);
			if (token !== this.loadToken) {
				return;
			}
			this.summaries = this.mergeSummaries(
				this.summaries,
				summariesFromListingTransactions(this.app, this.mod, txs)
			);
		} catch (err) {
			console.warn('Store: storefront archive load failed', err?.message || err);
			if (token !== this.loadToken) {
				return;
			}
			// Keep any local / pending-confirmed summaries already present.
		}

		if (token !== this.loadToken) {
			return;
		}

		this.loading = false;
		this.render();
	}

	isOwnStorefront() {
		const walletKey = this.mod.publicKey || '';
		return !!this.publicKey && !!walletKey && this.publicKey === walletKey;
	}

	/**
	 * Prefer richer local summaries (pending → confirmed) over sparse archive rows.
	 */
	mergeSummaries(existing = [], incoming = []) {
		const bySig = new Map();
		const byBucket = new Map();

		const remember = (summary) => {
			if (!summary) {
				return;
			}
			if (summary.listing_signature) {
				bySig.set(summary.listing_signature, summary);
			}
			if (summary.nft_id) {
				byBucket.set(`${summary.nft_id}:${Number(summary.price) || 0}`, summary);
			}
		};

		for (const summary of existing) {
			remember(summary);
		}

		for (const summary of incoming) {
			const prior =
				(summary.listing_signature && bySig.get(summary.listing_signature)) ||
				(summary.nft_id
					? byBucket.get(`${summary.nft_id}:${Number(summary.price) || 0}`)
					: null);

			if (!prior) {
				remember(summary);
				continue;
			}

			remember(this.preferRicherSummary(prior, summary));
		}

		const merged = [];
		const seen = new Set();
		for (const summary of [...bySig.values(), ...byBucket.values()]) {
			const key = summary.listing_signature || `${summary.nft_id}:${Number(summary.price) || 0}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			merged.push(summary);
		}
		return merged;
	}

	preferRicherSummary(a, b) {
		const score = (summary) => {
			let n = 0;
			if (String(summary?.title || '').trim()) {
				n += 4;
			}
			if (summary?.seller) {
				n += 2;
			}
			if (Number(summary?.price) > 0) {
				n += 2;
			}
			if (summary?.listing_tx) {
				n += 1;
			}
			if (summary?.image) {
				n += 1;
			}
			return n;
		};

		if (score(a) >= score(b)) {
			if (!a.listing_tx && b.listing_tx) {
				a.listing_tx = b.listing_tx;
			}
			if (!a.listing_signature && b.listing_signature) {
				a.listing_signature = b.listing_signature;
			}
			if (!a.nft && b.nft) {
				a.nft = b.nft;
			}
			a.pending = false;
			return a;
		}

		if (!b.listing_tx && a.listing_tx) {
			b.listing_tx = a.listing_tx;
		}
		if (!String(b.title || '').trim() && a.title) {
			b.title = a.title;
		}
		if (!b.seller && a.seller) {
			b.seller = a.seller;
		}
		if (!Number(b.price) && Number(a.price)) {
			b.price = a.price;
		}
		b.pending = false;
		return b;
	}

	renderTeasersOnly() {
		const teasersEl = document.querySelector(`${this.container} .teasers`);
		if (!teasersEl) {
			return;
		}
		const visible = this.returnVisibleSummaries();
		if (!visible.length) {
			return;
		}
		this.teasers.render(`${this.container} .teasers`, visible);
	}

	renderResults() {
		const status = document.querySelector(`${this.container} [data-storefront-status]`);
		if (status) {
			status.hidden = true;
			status.innerHTML = '';
		}

		const teasersEl = document.querySelector(`${this.container} .teasers`);
		if (!teasersEl) {
			return;
		}

		const visible = this.returnVisibleSummaries();
		if (!visible.length) {
			teasersEl.innerHTML = '';
			const emptyHost = document.createElement('div');
			emptyHost.className = 'storefront-empty';
			teasersEl.appendChild(emptyHost);

			const isOwn = this.isOwnStorefront();
			this.empty.title = 'No listings yet';
			this.empty.body = isOwn
				? 'Items you put up for sale will appear here.'
				: 'This creator has not published any listings yet.';
			this.empty.actionLabel = isOwn ? 'Add New Listing' : '';
			this.empty.onAction = isOwn ? () => this.onSell?.() : null;
			this.empty.render(`${this.container} .storefront-empty`);
			return;
		}

		this.teasers.render(`${this.container} .teasers`, visible);
	}

	returnVisibleSummaries() {
		const pending = this.isOwnStorefront()
			? this.mod.listing_lifecycle?.returnPendingSummariesForSeller?.(this.publicKey) || []
			: [];

		const pendingSigs = new Set(
			pending.map((s) => s.listing_signature).filter(Boolean)
		);

		const confirmed = this.filterHiddenListings(this.summaries).filter((summary) => {
			if (summary.listing_signature && pendingSigs.has(summary.listing_signature)) {
				return false;
			}
			return true;
		});

		// Pending shims first so the user sees the item being confirmed.
		return [...pending, ...confirmed];
	}

	filterHiddenListings(summaries = []) {
		const lifecycle = this.mod.purchase_lifecycle;
		if (!lifecycle?.isListingHidden) {
			return summaries;
		}
		return summaries.filter((summary) => !lifecycle.isListingHidden(summary));
	}

	escapeHtml(value = '') {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}

module.exports = StorefrontView;
