const Summary = require('./summary');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

/**
 * Load a transaction from the Archive module (localhost first, then a remote peer).
 */
function loadTransactionFromPeer(app, signature, peer = 'localhost') {
	return new Promise((resolve) => {
		if (!signature || !app?.storage?.loadTransactions) {
			resolve(null);
			return;
		}

		app.storage.loadTransactions({ sig: signature }, (txs) => {
			resolve(txs?.[0] || null);
		}, peer);
	});
}

async function loadTransactionFromArchive(app, signature) {
	if (!signature) {
		return null;
	}

	let tx = await loadTransactionFromPeer(app, signature, 'localhost');
	if (tx) {
		return tx;
	}

	try {
		const peers = await app.network.getPeers();
		if (peers?.length) {
			tx = await loadTransactionFromPeer(app, signature, peers[0]);
		}
	} catch (err) {
		// fall through
	}

	return tx || null;
}

function loadTransactionsFromPeer(app, query = {}, peer = 'localhost') {
	return new Promise((resolve) => {
		if (!app?.storage?.loadTransactions) {
			resolve([]);
			return;
		}

		app.storage.loadTransactions(query, (txs) => {
			resolve(Array.isArray(txs) ? txs : []);
		}, peer);
	});
}

/**
 * Load Store listing transactions created by a public key (archive field2 = sender).
 *
 * Future sold-state filtering can narrow this query (or post-filter results) via
 * archive metadata such as field4/field5 once listing lifecycle is written there.
 */
async function loadListingTransactionsForSeller(app, publicKey = '') {
	const seller = String(publicKey || '').trim();
	if (!seller) {
		return [];
	}

	const query = { field1: 'Store', field2: seller };

	let txs = await loadTransactionsFromPeer(app, query, 'localhost');
	if (txs.length) {
		return txs;
	}

	try {
		const peers = await app.network.getPeers();
		for (const peer of peers || []) {
			txs = await loadTransactionsFromPeer(app, query, peer);
			if (txs.length) {
				return txs;
			}
		}
	} catch (err) {
		console.warn('Store: loadListingTransactionsForSeller peer query failed', err?.message || err);
	}

	return [];
}

/**
 * Convert a list-asset archive transaction into a Summary for teaser rendering.
 * Skips fulfillment txs (fulfill_sale) — those are settlement, not creator listings.
 */
function summaryFromListingTransaction(app, mod, tx) {
	if (!tx || !app || !mod) {
		return null;
	}

	const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : null;
	if (!txmsg || txmsg.module !== 'Store' || txmsg.request !== 'list-asset') {
		return null;
	}

	// Settlement / relist fulfillments are not creator storefront listings.
	if (txmsg.fulfill_sale) {
		return null;
	}

	const listing = txmsg.listing || {};
	const nft = new SaitoNFT(app, mod, tx, null);
	const price_nolan = Number(app.wallet?.convertSaitoToNolan?.(listing.price ?? 0) ?? 0);
	const qty = Number(listing.quantity_total ?? nft.amount ?? 1) || 1;
	const seller = tx.from?.[0]?.publicKey || '';
	const nft_id = String(nft.id || nft.uuid || listing.nft_id || '').trim();

	if (!nft_id) {
		return null;
	}

	return new Summary(app, mod, {
		nft_id,
		seller,
		title: String(listing.title || txmsg.title || nft.title || '').trim(),
		description: String(listing.description ?? txmsg.description ?? nft.description ?? '').trim(),
		price: price_nolan,
		quantity_available: qty,
		quantity_total: qty,
		listing_signature: tx.signature || '',
		listing_tx: tx,
		nft
	});
}

function summariesFromListingTransactions(app, mod, txs = []) {
	const summaries = [];
	for (const tx of txs) {
		const summary = summaryFromListingTransaction(app, mod, tx);
		if (summary) {
			summaries.push(summary);
		}
	}
	return summaries;
}

module.exports = {
	loadTransactionFromPeer,
	loadTransactionFromArchive,
	loadListingTransactionsForSeller,
	summaryFromListingTransaction,
	summariesFromListingTransactions
};
