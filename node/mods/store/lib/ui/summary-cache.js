const Summary = require('../summary');
const { returnDemoSummaries } = require('../summary');

function summaryBucketKey(nft_id = '', price = 0) {
	return `${nft_id}:${Number(price)}`;
}

function summaryDomId(summary) {
	// Prefer listing signature so multiple listings for the same nft:price stay distinct.
	if (summary?.listing_signature) {
		return `store-teaser-${encodeURIComponent(summary.listing_signature)}`;
	}
	const key = summaryBucketKey(summary?.nft_id, summary?.price);
	return `store-teaser-${encodeURIComponent(key)}`;
}

function syncSummaryCache(mod, data) {
	const summary = data instanceof Summary ? data : new Summary(mod.app, mod, data);
	if (!summary.nft_id) {
		return null;
	}

	const key = summaryBucketKey(summary.nft_id, summary.price);
	mod.summaries[key] = summary;
	return summary;
}

function removeSummaryFromCache(mod, nft_id, price) {
	delete mod.summaries[summaryBucketKey(nft_id, price)];
}

function getSummariesForSale(mod) {
	const summaries = Object.values(mod.summaries).filter((summary) => {
		if (!summary.isActive()) {
			return false;
		}
		if (mod.purchase_lifecycle?.isListingHidden?.(summary)) {
			return false;
		}
		return true;
	});
	if (summaries.length > 0) {
		return summaries;
	}

	return returnDemoSummaries(mod.app, mod);
}

module.exports = {
	summaryBucketKey,
	summaryDomId,
	syncSummaryCache,
	removeSummaryFromCache,
	getSummariesForSale
};
