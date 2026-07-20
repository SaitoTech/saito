module.exports = {
	pendingOverlay({ listingTitle = '' } = {}) {
		return `
<article class="purchase pending" aria-labelledby="purchase-pending-title" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="purchase-pending-title">Order submitted</h2>
    <p class="lead">Your purchase is on the network.</p>
    <p class="subtitle rs-confirmation-subtitle" aria-live="polite">waiting for confirmation...</p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown rs-confirmation-countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>
</article>`;
	},

	processingOverlay({ listingTitle = '' } = {}) {
		return `
<article class="purchase confirmed" aria-labelledby="purchase-confirmed-title">
  <div class="stack">
    <div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>
    <h2 class="title" id="purchase-confirmed-title">Payment confirmed</h2>
    <p class="lead">
      The Store is fulfilling your order${listingTitle ? ` for <strong>${listingTitle}</strong>` : ''}.
      Your NFT should arrive shortly.
    </p>
    <button type="button" class="saito-button-primary" data-action="purchase-close">Close</button>
  </div>
</article>`;
	}
};
