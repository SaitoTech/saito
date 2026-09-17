module.exports = {
  fulfillingOverlay({ listingTitle = '' } = {}) {
    return `
<article class="purchase fulfilling saito-transaction-monitor saito-overlay-panel retain-surface" aria-labelledby="purchase-fulfilling-title" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="purchase-fulfilling-title">Payment Confirmed</h2>
    <p class="lead">The Store is fulfilling your order…</p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>
</article>`;
  },

  completeOverlay({ listingTitle = '' } = {}) {
    const lead = listingTitle
      ? `<strong>${listingTitle}</strong> has arrived`
      : 'Your NFT has arrived';

    return `
<article class="purchase complete saito-overlay-panel retain-surface" aria-labelledby="purchase-complete-title">
  <div class="stack">
    <div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>
    <h2 class="title" id="purchase-complete-title">NFT Received!</h2>
    <p class="lead">${lead}</p>
    <button type="button" class="saito-button-primary" data-action="view-nfts">View in Wallet</button>
  </div>
</article>`;
  },

  /** @deprecated use fulfillingOverlay / completeOverlay */
  processingOverlay(opts = {}) {
    return this.fulfillingOverlay(opts);
  }
};
