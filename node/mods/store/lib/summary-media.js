const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { loadTransactionFromArchive } = require('./archive');

const DREAMSCAPE_PLACEHOLDER = '/saito/img/dreamscape.png';

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

  const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : {};
  const listing = txmsg?.listing || {};

  const title = String(listing.title || txmsg.title || '').trim();
  if (title && !String(summary.title || '').trim()) {
    summary.title = title;
  }

  const description = listing.description ?? txmsg.description;
  if (description != null && description !== '' && !summary.description) {
    summary.description = String(description);
  }

  if (!summary.seller) {
    const seller = tx.from?.[0]?.publicKey || '';
    if (seller) {
      summary.seller = seller;
    }
  }

  if (!Number(summary.price)) {
    const raw_price = listing.price ?? txmsg.price;
    if (raw_price != null && raw_price !== '') {
      const converted = Number(
        summary.app?.wallet?.convertSaitoToNolan?.(raw_price) ?? raw_price ?? 0
      );
      if (Number.isFinite(converted) && converted > 0) {
        summary.price = converted;
      }
    }
  }

  try {
    const nft = new SaitoNFT(summary.app, summary.mod, tx, null);
    summary.nft = nft;

    if (!String(summary.title || '').trim() && nft.title) {
      summary.title = nft.title;
    }

    const image = nft.returnImage?.() || '';
    if (image) {
      summary.image = image;
    }
  } catch (err) {
    console.warn('Store: applyListingTransaction NFT parse failed', err?.message || err);
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
  if (!summary || summary.image) {
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
  tryLoadImageUrl,
  applyListingTransaction,
  ensureListingTransaction,
  enrichSummaryMedia,
  notifySummaryUpdated
};
