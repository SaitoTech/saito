module.exports = {
  fulfillingOverlay({ listingTitle = '' } = {}) {
    const lead = listingTitle
      ? `The Store is fulfilling your order for <strong>${listingTitle}</strong>.`
      : 'The Store is fulfilling your order.';

    return `
<article class="purchase fulfilling saito-overlay-panel retain-surface" aria-labelledby="purchase-fulfilling-title" aria-live="polite">
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
<article class="purchase complete saito-overlay-panel retain-surface" aria-labelledby="purchase-complete-title">
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
