const Summary = require('../summary');
const { DEFAULT_PAGE_SIZE, normalizeOffset, normalizePageSize } = require('../categories');

/**
 * Fetch one page of listings from the Store peer.
 * public_key '' → server applies its ModTools whitelist (active listings).
 * public_key set → that seller's listings for status 'active' (default) or 'sold'.
 */
function loadListingsPage(
  app,
  mod,
  { public_key = '', category = '', offset = 0, page_size = DEFAULT_PAGE_SIZE, status = 'active' } = {}
) {
  return new Promise((resolve, reject) => {
    const peerKey = mod.store_public_key;
    if (!peerKey || !app?.network?.sendRequestAsTransaction) {
      reject(new Error('Store peer unavailable'));
      return;
    }

    const request = {
      module: 'Store',
      public_key: String(public_key || ''),
      category: String(category || ''),
      offset: normalizeOffset(offset),
      page_size: normalizePageSize(page_size),
      status: String(status || '').toLowerCase() === 'sold' ? 'sold' : 'active'
    };

    app.network.sendRequestAsTransaction(
      'load-listings',
      request,
      (response) => {
        if (!response || !Array.isArray(response.listings)) {
          reject(new Error('Invalid load-listings response'));
          return;
        }

        // Listing-row browse cards: do not sync into nft_id:price bucket cache
        // (distinct listings sharing a bucket must not overwrite each other).
        const listings = response.listings
          .map((data) => new Summary(app, mod, data))
          .filter((summary) => !!summary.nft_id);

        resolve({
          listings,
          public_key: response.public_key || request.public_key,
          category: response.category || request.category,
          pagination: response.pagination || {
            offset: request.offset,
            page_size: request.page_size,
            total: listings.length,
            total_pages: listings.length ? 1 : 0,
            page: 1,
            has_next: false,
            has_previous: false
          }
        });
      },
      peerKey
    );
  });
}

/**
 * Fetch a seller's sold listings (and active) from the Store peer.
 * Sold-only use; active browsing goes through loadListingsPage.
 */
function loadSellerInventory(app, mod, seller = '') {
  return new Promise((resolve, reject) => {
    const key = String(seller || '').trim();
    if (!key) {
      reject(new Error('Seller public key required'));
      return;
    }

    const peerKey = mod.store_public_key;
    if (!peerKey || !app?.network?.sendRequestAsTransaction) {
      reject(new Error('Store peer unavailable'));
      return;
    }

    app.network.sendRequestAsTransaction(
      'load-seller-inventory',
      { module: 'Store', seller: key },
      (response) => {
        if (!response || !Array.isArray(response.active) || !Array.isArray(response.sold)) {
          reject(new Error('Invalid load-seller-inventory response'));
          return;
        }

        const hydrate = (data) => {
          const summary = new Summary(app, mod, data);
          return summary.nft_id ? summary : null;
        };

        resolve({
          seller: response.seller || key,
          active: response.active.map(hydrate).filter(Boolean),
          sold: response.sold.map(hydrate).filter(Boolean)
        });
      },
      peerKey
    );
  });
}

module.exports = {
  loadListingsPage,
  loadSellerInventory
};
