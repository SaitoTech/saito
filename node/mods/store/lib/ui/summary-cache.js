const Summary = require('../summary');

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

module.exports = {
  summaryBucketKey,
  summaryDomId,
  syncSummaryCache
};
