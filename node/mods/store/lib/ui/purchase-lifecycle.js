const { summaryBucketKey, summaryDomId } = require('./summary-cache');

const PHASE = {
	SUBMITTED: 'submitted',
	CONFIRMING: 'confirming',
	FULFILLING: 'fulfilling',
	COMPLETE: 'complete',
	DISMISSED: 'dismissed'
};

const NFT_POLL_MS = 2000;

/**
 * Tracks outstanding Store purchases for the current browser session.
 * Owns local listing-hide state, wallet arrival detection, and emits
 * `store-purchase-lifecycle` on changes.
 *
 * Future: multiple concurrent purchases, retries, archive sold-state updates.
 */
class PurchaseLifecycle {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.purchases = [];
		this.hidden = {};
		this._nftPollTimer = null;
		this._checkingWallet = false;

		this.app.connection.on('wallet-updated', () => {
			// Wallet already ran updateNFTList; only inspect options here.
			void this.checkWalletForArrival({ sync: false });
		});
		this.app.connection.on('on-nft-received', (payload) => {
			this.onNftReceived(payload);
		});
		this.app.connection.on('store-new-block', () => {
			void this.checkWalletForArrival();
		});
	}

	/**
	 * Begin tracking a purchase after the tx is submitted.
	 * Hides the listing locally and notifies listeners.
	 */
	begin({ summary = null, purchaseTxSignature = '', quantity = 1 } = {}) {
		if (!summary?.nft_id || !purchaseTxSignature) {
			return null;
		}

		this.hideListing(summary);

		const baselineCount = this.countNftInWallet(summary.nft_id);
		const purchase = {
			id: `${purchaseTxSignature}:${Date.now()}`,
			nft_id: String(summary.nft_id),
			price: Number(summary.price ?? 0),
			listing_signature: summary.listing_signature || '',
			purchase_tx_signature: purchaseTxSignature,
			title: summary.returnTitle?.() || summary.title || 'NFT',
			quantity: Math.max(1, Number(quantity) || 1),
			phase: PHASE.SUBMITTED,
			status: 'Purchasing NFT…',
			detail: 'Transaction submitted.',
			baseline_wallet_count: baselineCount,
			started_at: Date.now(),
			completed_at: 0
		};

		this.purchases.push(purchase);
		this.setPhase(purchase.id, PHASE.CONFIRMING, {
			status: 'Purchasing NFT…',
			detail: 'Waiting for next block…'
		});

		this.startNftPolling();

		if (typeof siteMessage === 'function') {
			siteMessage(`Purchasing ${purchase.title}…`, 4000);
		}

		this.app.connection.emit('store-render-listings');
		return purchase;
	}

	hideListing(summary) {
		if (!summary?.nft_id) {
			return;
		}

		const keys = this.listingHideKeys(summary);
		for (const key of keys) {
			this.hidden[key] = {
				nft_id: String(summary.nft_id),
				price: Number(summary.price ?? 0),
				listing_signature: summary.listing_signature || '',
				hidden_at: Date.now()
			};
		}

		const card = document.getElementById(summaryDomId(summary));
		card?.remove();
	}

	listingHideKeys(summary) {
		const keys = [];
		const bucket = summaryBucketKey(summary.nft_id, summary.price);
		keys.push(`bucket:${bucket}`);
		if (summary.listing_signature) {
			keys.push(`sig:${summary.listing_signature}`);
		}
		keys.push(`nft:${String(summary.nft_id)}`);
		return keys;
	}

	isListingHidden(summary) {
		if (!summary?.nft_id) {
			return false;
		}
		return this.listingHideKeys(summary).some((key) => !!this.hidden[key]);
	}

	findById(id = '') {
		return this.purchases.find((p) => p.id === id) || null;
	}

	findByPurchaseTx(signature = '') {
		if (!signature) {
			return null;
		}
		return (
			this.purchases.find(
				(p) => p.purchase_tx_signature === signature && p.phase !== PHASE.DISMISSED
			) || null
		);
	}

	findByNftId(nft_id = '') {
		const id = String(nft_id || '');
		if (!id) {
			return null;
		}
		return (
			this.purchases.find(
				(p) =>
					p.nft_id === id &&
					p.phase !== PHASE.COMPLETE &&
					p.phase !== PHASE.DISMISSED
			) || null
		);
	}

	/** Active purchase the UI should surface (pending or just completed). */
	returnActivePurchase() {
		const pending = this.purchases.find(
			(p) =>
				p.phase === PHASE.SUBMITTED ||
				p.phase === PHASE.CONFIRMING ||
				p.phase === PHASE.FULFILLING
		);
		if (pending) {
			return pending;
		}
		return this.purchases.find((p) => p.phase === PHASE.COMPLETE) || null;
	}

	hasPendingPurchases() {
		return this.purchases.some(
			(p) =>
				p.phase === PHASE.SUBMITTED ||
				p.phase === PHASE.CONFIRMING ||
				p.phase === PHASE.FULFILLING
		);
	}

	setPhase(id, phase, { status = '', detail = '' } = {}) {
		const purchase = this.findById(id);
		if (!purchase) {
			return null;
		}

		purchase.phase = phase;
		if (status) {
			purchase.status = status;
		}
		if (detail) {
			purchase.detail = detail;
		}
		if (phase === PHASE.COMPLETE) {
			purchase.completed_at = Date.now();
			if (!this.hasPendingPurchases()) {
				this.stopNftPolling();
			}
		}
		if (phase === PHASE.DISMISSED && !this.hasPendingPurchases()) {
			this.stopNftPolling();
		}

		this.emit(purchase);
		return purchase;
	}

	markPaymentConfirmed(purchaseTxSignature = '') {
		const purchase = this.findByPurchaseTx(purchaseTxSignature);
		if (!purchase) {
			return null;
		}
		if (
			purchase.phase === PHASE.COMPLETE ||
			purchase.phase === PHASE.DISMISSED ||
			purchase.phase === PHASE.FULFILLING
		) {
			return purchase;
		}

		const updated = this.setPhase(purchase.id, PHASE.FULFILLING, {
			status: 'Payment confirmed',
			detail: 'Waiting for your NFT to arrive…'
		});
		this.startNftPolling();
		this.checkWalletForArrival();
		return updated;
	}

	markComplete(purchase) {
		if (!purchase || purchase.phase === PHASE.COMPLETE) {
			return purchase || null;
		}

		const updated = this.setPhase(purchase.id, PHASE.COMPLETE, {
			status: 'NFT received!',
			detail: 'Your NFT has arrived in your wallet.'
		});

		if (typeof siteMessage === 'function') {
			siteMessage(`NFT received: ${purchase.title}`, 5000);
		}

		return updated;
	}

	dismiss(id = '') {
		const purchase = id ? this.findById(id) : this.returnActivePurchase();
		if (!purchase) {
			return null;
		}
		return this.setPhase(purchase.id, PHASE.DISMISSED, {
			status: '',
			detail: ''
		});
	}

	countNftInWallet(nft_id = '') {
		const id = String(nft_id || '');
		if (!id) {
			return 0;
		}
		const list = this.app.options?.wallet?.nfts || [];
		let count = 0;
		for (const rec of list) {
			if (String(rec?.id ?? '') === id) {
				const amount = Number(rec?.slip1?.amount ?? rec?.amount ?? 1);
				count += Number.isFinite(amount) && amount > 0 ? amount : 1;
			}
		}
		return count;
	}

	/**
	 * Returns true when the wallet appears to hold the purchased NFT
	 * beyond the pre-purchase baseline.
	 */
	hasReceivedNft(purchase) {
		if (!purchase?.nft_id) {
			return false;
		}
		const current = this.countNftInWallet(purchase.nft_id);
		const needed = (purchase.baseline_wallet_count || 0) + (purchase.quantity || 1);
		return current >= needed;
	}

	onNftReceived(payload) {
		const nft_id = payload?.nft_id || payload?.id || '';
		if (!nft_id) {
			return;
		}
		if (!this.findByNftId(nft_id)) {
			return;
		}
		this.checkWalletForArrival();
	}

	startNftPolling() {
		if (this._nftPollTimer) {
			return;
		}
		this._nftPollTimer = setInterval(() => {
			this.checkWalletForArrival();
		}, NFT_POLL_MS);
	}

	stopNftPolling() {
		if (this._nftPollTimer) {
			clearInterval(this._nftPollTimer);
			this._nftPollTimer = null;
		}
	}

	async checkWalletForArrival({ sync = true } = {}) {
		if (this._checkingWallet || !this.hasPendingPurchases()) {
			return;
		}

		this._checkingWallet = true;
		try {
			if (sync && typeof this.app.wallet?.updateNFTList === 'function') {
				await this.app.wallet.updateNFTList();
			}

			for (const purchase of this.purchases) {
				if (
					purchase.phase === PHASE.COMPLETE ||
					purchase.phase === PHASE.DISMISSED
				) {
					continue;
				}
				if (this.hasReceivedNft(purchase)) {
					this.markComplete(purchase);
				}
			}
		} catch (err) {
			console.warn('Store: wallet NFT check failed', err?.message || err);
		} finally {
			this._checkingWallet = false;
		}
	}

	emit(purchase) {
		this.app.connection.emit('store-purchase-lifecycle', purchase);
	}
}

PurchaseLifecycle.PHASE = PHASE;

module.exports = PurchaseLifecycle;
