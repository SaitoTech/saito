const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { loadTransactionFromArchive } = require('./archive');

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/gif',
  'image/webp'
]);

function decodeImageDataURI(data_uri = '') {
  if (!data_uri || typeof data_uri !== 'string' || !data_uri.startsWith('data:image/')) {
    return null;
  }

  const comma = data_uri.indexOf(',');
  if (comma === -1) {
    return null;
  }

  const header = data_uri.slice(0, comma);
  const payload = data_uri.slice(comma + 1);
  const mime_match = header.match(/^data:(image\/[^;]+)/i);
  if (!mime_match) {
    return null;
  }

  let mime = mime_match[1].toLowerCase();
  if (mime === 'image/jpg') {
    mime = 'image/jpeg';
  }
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return null;
  }

  let bytes = null;
  if (header.includes(';base64')) {
    bytes = Buffer.from(payload, 'base64');
  } else {
    bytes = Buffer.from(decodeURIComponent(payload), 'utf8');
  }

  if (!bytes?.length) {
    return null;
  }

  return { mime, bytes };
}

async function initializeImageCache(mod) {
  if (mod.app.BROWSER) {
    return;
  }

  for (const summary of Object.values(mod.summaries)) {
    const nft_id = summary?.nft_id;
    if (!nft_id || mod.image_cache[nft_id]) {
      continue;
    }

    try {
      const listing = await mod.warehouse.db.returnActiveListingForBucket(
        summary.nft_id,
        summary.price
      );
      if (!listing?.signature) {
        continue;
      }

      const tx = await loadTransactionFromArchive(mod.app, listing.signature);
      if (!tx) {
        continue;
      }

      const txmsg = tx.returnMessage?.() || {};
      await mod.warehouse.persistSummaryMetadata(summary.nft_id, summary.price, txmsg);
      await mod.warehouse.syncSummaryToCache(summary.nft_id, summary.price);

      const nft = new SaitoNFT(mod.app, mod, tx, null);
      const image = nft.returnImage?.() || '';
      if (image) {
        mod.image_cache[nft_id] = image;
      }
    } catch (err) {
      continue;
    }
  }
}

function serveCachedImageResponse(mod, res, nft_id) {
  const image_data = mod.image_cache[nft_id];
  if (!image_data) {
    res.status(404).end();
    return;
  }

  const parsed = decodeImageDataURI(image_data);
  if (!parsed) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': parsed.mime,
    'Content-Length': parsed.bytes.length
  });
  res.end(parsed.bytes);
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  decodeImageDataURI,
  initializeImageCache,
  serveCachedImageResponse
};
