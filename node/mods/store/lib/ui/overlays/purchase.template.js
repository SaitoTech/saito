module.exports = {
	pendingOverlay({ listingTitle = '' } = {}) {
		const lead = listingTitle
			? `Purchasing <strong>${listingTitle}</strong>`
			: 'Purchasing NFT…';

		return `
<article class="purchase pending" aria-labelledby="purchase-pending-title" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="purchase-pending-title">Purchasing NFT…</h2>
    <p class="lead">${lead}</p>
    <p class="subtitle rs-confirmation-subtitle" aria-live="polite">Transaction submitted.</p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown rs-confirmation-countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>
</article>`;
	},

	fulfillingOverlay({ listingTitle = '' } = {}) {
		const lead = listingTitle
			? `The Store is fulfilling your order for <strong>${listingTitle}</strong>.`
			: 'The Store is fulfilling your order.';

		return `
<article class="purchase fulfilling" aria-labelledby="purchase-fulfilling-title" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="purchase-fulfilling-title">Payment confirmed</h2>
    <p class="lead">${lead}</p>
    <p class="subtitle" data-purchase-detail aria-live="polite">Waiting for your NFT to arrive…</p>
  </div>
</article>`;
	},

	completeOverlay({ listingTitle = '' } = {}) {
		const lead = listingTitle
			? `<strong>${listingTitle}</strong> has arrived in your wallet.`
			: 'Your NFT has arrived in your wallet.';

		return `
<article class="purchase complete" aria-labelledby="purchase-complete-title">
  <div class="stack">
    <div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>
    <h2 class="title" id="purchase-complete-title">NFT received!</h2>
    <p class="lead">${lead}</p>
    <button type="button" class="saito-button-primary" data-action="view-nfts">View in My NFTs</button>
    <button type="button" class="saito-button-secondary" data-action="purchase-close">Close</button>
  </div>
</article>`;
	},

	/** @deprecated use fulfillingOverlay / completeOverlay */
	processingOverlay(opts = {}) {
		return this.fulfillingOverlay(opts);
	}
};
