const Summary = require('../summary');

function summaryBucketKey(nft_id = '', price = 0) {
  return `${nft_id}:${Number(price)}`;
}

function escapeAttr(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function cssEscape(value = '') {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Listing identity for teaser DOM targeting.
 * Prefer listing_signature; fall back to nft_id:price bucket.
 * Returns the data-attribute name/value used on each `.teaser` instance.
 */
function listingTeaserIdentity(summary) {
  if (summary?.listing_signature) {
    return {
      attr: 'data-listing-signature',
      value: String(summary.listing_signature)
    };
  }
  return {
    attr: 'data-listing-bucket',
    value: summaryBucketKey(summary?.nft_id, summary?.price)
  };
}

/** HTML attribute fragment for a teaser root element (no id). */
function listingTeaserDataAttrs(summary) {
  const { attr, value } = listingTeaserIdentity(summary);
  if (!value) {
    return '';
  }
  return `${attr}="${escapeAttr(value)}"`;
}

/** CSS selector matching all teaser instances for this listing. */
function listingTeaserSelector(summary) {
  const { attr, value } = listingTeaserIdentity(summary);
  if (!value) {
    return '';
  }
  return `.teaser[${attr}="${cssEscape(value)}"]`;
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
  listingTeaserIdentity,
  listingTeaserDataAttrs,
  listingTeaserSelector,
  syncSummaryCache
};
