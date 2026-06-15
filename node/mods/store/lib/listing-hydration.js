const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');

/**
 * Lazy-fetch NFT payload from Archive (same path as SaitoNFT.fetchTransaction).
 * Updates listing.image and optional nft_title/nft_description in memory only.
 */
function hydrateListingFromArchive(app, mod, listing, onComplete = null) {
	if (!listing || listing.image != null) {
		if (onComplete) {
			onComplete(listing);
		}
		return;
	}

	const nft_id = listing.nft_id;
	const tx_sig = listing.nfttx_sig || listing.tx_sig;
	if (!nft_id && !tx_sig) {
		if (onComplete) {
			onComplete(listing);
		}
		return;
	}

	const nft = new SaitoNFT(app, mod, null, {
		id: nft_id,
		nft_id,
		nfttx_sig: tx_sig,
		tx_sig
	});

	nft.fetchTransaction(() => {
		if (nft.image) {
			listing.image = nft.image;
		}
		if (nft.title) {
			listing.nft_title = nft.title;
		}
		if (nft.description) {
			listing.nft_description = nft.description;
		}
		if (onComplete) {
			onComplete(listing);
		}
	});
}

module.exports = { hydrateListingFromArchive };
