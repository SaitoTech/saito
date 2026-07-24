const Summary = require('../summary');
const { syncSummaryCache } = require('./summary-cache');
const { DEFAULT_PAGE_SIZE, normalizePage, normalizePageSize } = require('../categories');

/**
 * Fetch one page of marketplace listings from the Store peer.
 * Replaces client browse state; does not accumulate the full catalog locally.
 */
function loadListingsPage(app, mod, { category = '', page = 1, page_size = DEFAULT_PAGE_SIZE } = {}) {
	return new Promise((resolve, reject) => {
		const peerKey = mod.store_public_key;
		if (!peerKey || !app?.network?.sendRequestAsTransaction) {
			reject(new Error('Store peer unavailable'));
			return;
		}

		const request = {
			module: 'Store',
			category: String(category || ''),
			page: normalizePage(page),
			page_size: normalizePageSize(page_size)
		};

		app.network.sendRequestAsTransaction(
			'load-listings',
			request,
			(response) => {
				if (!response || !Array.isArray(response.listings)) {
					reject(new Error('Invalid load-listings response'));
					return;
				}

				const listings = response.listings
					.map((data) => {
						const summary = syncSummaryCache(mod, data);
						return summary || new Summary(app, mod, data);
					})
					.filter(Boolean);

				resolve({
					listings,
					category: response.category || request.category,
					pagination: response.pagination || {
						page: request.page,
						page_size: request.page_size,
						total: listings.length,
						total_pages: listings.length ? 1 : 0,
						has_next: false,
						has_previous: false
					}
				});
			},
			peerKey
		);
	});
}

module.exports = {
	loadListingsPage
};
