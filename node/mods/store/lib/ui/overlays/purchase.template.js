module.exports = {
	pendingOverlay({ listingTitle = '' } = {}) {
		const title = listingTitle ? `Order Submitted` : 'Order Submitted';
		return `
<div class="store-purchase-overlay store-purchase-waiting is-pending">
  <div class="store-purchase-inner">
    <div class="rs-confirmation-stack">
      <div class="rs-publish-spinner" aria-hidden="true">
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
      </div>
      <h2 class="store-purchase-title rs-confirmation-title">${title}</h2>
      <p class="store-purchase-lead">Your purchase has been submitted to the network.</p>
      <div class="rs-confirmation-subtitle store-purchase-subtitle" aria-live="polite">waiting for confirmation...</div>
      <div class="rs-confirmation-timer">
        <span class="rs-confirmation-timer-label">expected time to next block</span>
        <span class="rs-confirmation-countdown" aria-live="polite">—</span>
        <span class="rs-confirmation-timer-unit">seconds</span>
      </div>
    </div>
  </div>
</div>`;
	},

	processingOverlay({ listingTitle = '' } = {}) {
		return `
<div class="store-purchase-overlay store-purchase-waiting is-processing">
  <div class="store-purchase-inner">
    <div class="store-purchase-success-icon" aria-hidden="true">✓</div>
    <h2 class="store-purchase-title">Payment Confirmed</h2>
    <p class="store-purchase-lead">
      The Store is processing your order${listingTitle ? ` for <strong>${listingTitle}</strong>` : ''}.
      Your NFT should arrive momentarily.
    </p>
    <button type="button" class="store-purchase-close-btn" data-action="purchase-close">Close</button>
  </div>
</div>`;
	}
};
