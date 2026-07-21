const Summary = require('../summary');
const { syncSummaryCache } = require('./summary-cache');

const PHASE = {
	SUBMITTED: 'submitted',
	CONFIRMING: 'confirming',
	COMPLETE: 'complete',
	DISMISSED: 'dismissed'
};

/**
 * Tracks outstanding Store listings for the current browser session.
 * Owns local pending listing shims and emits `store-listing-lifecycle`.
 *
 * Future: multiple simultaneous listings, retries, failed broadcasts.
 */
class ListingLifecycle {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.listings = [];

		this.app.connection.on('store-list-asset', (data) => {
			this.onStoreListAsset(data);
		});
		this.app.connection.on('store-new-block', () => {
			this.emitActive();
		});
	}

	/**
	 * Begin tracking a listing after the tx is broadcast.
	 */
	begin({
		nft = null,
		listing = {},
		listingTx = null,
		sellerPublicKey = ''
	} = {}) {
		const signature = listingTx?.signature || '';
		const nft_id = String(nft?.id || nft?.uuid || listing?.nft_id || '').trim();
		if (!signature || !nft_id) {
			return null;
		}

		const seller =
			String(sellerPublicKey || this.mod.publicKey || '').trim() ||
			listingTx?.from?.[0]?.publicKey ||
			'';

		const price_nolan = Number(
			this.app.wallet?.convertSaitoToNolan?.(listing.price ?? 0) ?? 0
		);
		const qty = Math.max(1, Number(listing.quantity_total ?? nft?.amount ?? 1) || 1);
		const title = String(listing.title || nft?.title || 'Untitled Item').trim();
		const description = String(listing.description ?? nft?.description ?? '').trim();
		const image = nft?.returnImage?.() || nft?.image || null;

		const summary = new Summary(this.app, this.mod, {
			nft_id,
			seller,
			title,
			description,
			price: price_nolan,
			quantity_available: qty,
			quantity_total: qty,
			listing_signature: signature,
			listing_tx: listingTx,
			nft,
			image,
			pending: true,
			badge: false
		});
		summary.pending = true;
		if (listingTx) {
			summary.hydrateFromListingTransaction();
		}

		const entry = {
			id: `${signature}:${Date.now()}`,
			nft_id,
			seller,
			price: price_nolan,
			listing_signature: signature,
			title,
			phase: PHASE.CONFIRMING,
			status: 'Listing Submitted',
			detail: 'Waiting for confirmation…',
			summary,
			started_at: Date.now(),
			completed_at: 0
		};

		this.listings.push(entry);
		this.emit(entry);

		if (typeof siteMessage === 'function') {
			siteMessage(`Listing submitted: ${title}`, 4000);
		}

		return entry;
	}

	findById(id = '') {
		return this.listings.find((l) => l.id === id) || null;
	}

	findByListingTx(signature = '') {
		if (!signature) {
			return null;
		}
		return (
			this.listings.find(
				(l) => l.listing_signature === signature && l.phase !== PHASE.DISMISSED
			) || null
		);
	}

	returnActiveListing() {
		const pending = this.listings.find(
			(l) => l.phase === PHASE.SUBMITTED || l.phase === PHASE.CONFIRMING
		);
		if (pending) {
			return pending;
		}
		return this.listings.find((l) => l.phase === PHASE.COMPLETE) || null;
	}

	returnPendingSummariesForSeller(sellerPublicKey = '') {
		const seller = String(sellerPublicKey || '').trim();
		return this.listings
			.filter(
				(l) =>
					(l.phase === PHASE.SUBMITTED || l.phase === PHASE.CONFIRMING) &&
					(!seller || l.seller === seller)
			)
			.map((l) => l.summary)
			.filter(Boolean);
	}

	setPhase(id, phase, { status = '', detail = '' } = {}) {
		const entry = this.findById(id);
		if (!entry) {
			return null;
		}

		entry.phase = phase;
		if (status) {
			entry.status = status;
		}
		if (detail) {
			entry.detail = detail;
		}
		if (phase === PHASE.COMPLETE) {
			entry.completed_at = Date.now();
			if (entry.summary) {
				entry.summary.pending = false;
			}
		}

		this.emit(entry);
		return entry;
	}

	markConfirmed(listingTxSignature = '', confirmedTx = null) {
		const entry = this.findByListingTx(listingTxSignature);
		if (!entry) {
			return null;
		}
		if (entry.phase === PHASE.COMPLETE || entry.phase === PHASE.DISMISSED) {
			return entry;
		}

		if (confirmedTx && entry.summary) {
			entry.summary.listing_tx = confirmedTx;
			entry.summary.listing_signature = confirmedTx.signature || entry.listing_signature;
		}

		if (entry.summary) {
			entry.summary.pending = false;
			syncSummaryCache(this.mod, entry.summary);
		}

		const updated = this.setPhase(entry.id, PHASE.COMPLETE, {
			status: 'Listing Published',
			detail: 'Your NFT is now available in your Store.'
		});

		if (typeof siteMessage === 'function') {
			siteMessage(`Listing published: ${entry.title}`, 5000);
		}

		this.app.connection.emit('store-render-listings');
		return updated;
	}

	dismiss(id = '') {
		const entry = id ? this.findById(id) : this.returnActiveListing();
		if (!entry) {
			return null;
		}
		return this.setPhase(entry.id, PHASE.DISMISSED, {
			status: '',
			detail: ''
		});
	}

	onStoreListAsset({ tx, conf } = {}) {
		if (Number(conf) !== 0 || !tx?.signature) {
			return;
		}

		const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : null;
		if (!txmsg || txmsg.module !== 'Store' || txmsg.request !== 'list-asset') {
			return;
		}
		// Fulfillments are also list-asset; only match tracked listing signatures.
		if (txmsg.fulfill_sale) {
			return;
		}

		this.markConfirmed(tx.signature, tx);
	}

	emitActive() {
		const active = this.returnActiveListing();
		if (active) {
			this.emit(active);
		}
	}

	emit(entry) {
		this.app.connection.emit('store-listing-lifecycle', entry);
	}
}

ListingLifecycle.PHASE = PHASE;

module.exports = ListingLifecycle;
