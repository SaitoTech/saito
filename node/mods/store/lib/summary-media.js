const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { loadTransactionFromArchive } = require('./archive');

const DREAMSCAPE_PLACEHOLDER = '/saito/img/dreamscape.png';

function isDemoNftId(nft_id = '') {
	return String(nft_id).startsWith('store-demo-');
}

function tryLoadImageUrl(url = '') {
	return new Promise((resolve) => {
		if (!url || typeof Image === 'undefined') {
			resolve(false);
			return;
		}

		const img = new Image();
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
		img.src = url;
	});
}

function applyListingTransaction(summary, tx) {
	if (!summary || !tx) {
		return summary;
	}

	summary.listing_tx = tx;
	if (tx.signature) {
		summary.listing_signature = tx.signature;
	}

	const txmsg = tx.returnMessage?.() || {};
	const listing = txmsg.listing || {};

	if (listing.title && !summary.title) {
		summary.title = listing.title;
	}
	if (listing.description != null && listing.description !== '' && !summary.description) {
		summary.description = listing.description;
	}

	const nft = new SaitoNFT(summary.app, summary.mod, tx, null);
	summary.nft = nft;

	const image = nft.returnImage?.() || '';
	if (image) {
		summary.image = image;
	}

	return summary;
}

function notifySummaryUpdated(summary) {
	if (summary?.app?.connection) {
		summary.app.connection.emit('store-listing-updated', summary);
	}
}

async function ensureListingTransaction(summary) {
	if (!summary || summary.listing_tx) {
		return summary;
	}

	if (summary._listing_tx_promise) {
		return summary._listing_tx_promise;
	}

	const signature = summary.listing_signature || '';
	if (!signature) {
		return summary;
	}

	summary._listing_tx_promise = loadTransactionFromArchive(summary.app, signature).then((tx) => {
		if (tx) {
			applyListingTransaction(summary, tx);
		}
		return summary;
	});

	return summary._listing_tx_promise;
}

async function enrichSummaryMedia(summary) {
	if (!summary || summary.image || isDemoNftId(summary.nft_id)) {
		return summary;
	}

	if (summary._media_enrich_promise) {
		return summary._media_enrich_promise;
	}

	summary._media_enrich_promise = (async () => {
		const cache_url = summary.returnCacheImageUrl?.() || '';
		if (cache_url) {
			const ok = await tryLoadImageUrl(cache_url);
			if (ok) {
				summary.image = cache_url;
				summary._image_source = 'store-cache';
				notifySummaryUpdated(summary);
				return summary;
			}
		}

		await ensureListingTransaction(summary);
		if (summary.image) {
			summary._image_source = 'archive';
		}

		summary._media_enriched = true;
		notifySummaryUpdated(summary);

		return summary;
	})();

	return summary._media_enrich_promise;
}

module.exports = {
	DREAMSCAPE_PLACEHOLDER,
	isDemoNftId,
	tryLoadImageUrl,
	applyListingTransaction,
	ensureListingTransaction,
	enrichSummaryMedia,
	notifySummaryUpdated
};
