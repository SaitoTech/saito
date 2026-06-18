const Listing = require('../listing');
const { returnDemoListings } = Listing;

function syncListingCache(mod, data) {
	const listing = data instanceof Listing ? data : new Listing(mod.app, mod, data);
	if (!listing.id) {
		return null;
	}

	mod.listings[listing.id] = listing;
	return listing;
}

function removeListingFromCache(mod, listing_id) {
	delete mod.listings[listing_id];
}

function getItemsForSale(mod) {
	const listings = Object.values(mod.listings).filter((listing) => listing.isActive());
	if (listings.length > 0) {
		return listings;
	}

	return returnDemoListings(mod.app, mod);
}

module.exports = {
	syncListingCache,
	removeListingFromCache,
	getItemsForSale
};
