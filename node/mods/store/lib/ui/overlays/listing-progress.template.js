module.exports = {
	pendingOverlay({ listingTitle = '' } = {}) {
		const lead = listingTitle
			? `Your listing for <strong>${listingTitle}</strong> has been broadcast to the Saito network.`
			: 'Your listing has been broadcast to the Saito network.';

		return `
<article class="listing-progress pending" aria-labelledby="listing-progress-title" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="listing-progress-title">Listing Submitted</h2>
    <p class="lead">${lead}</p>
    <p class="subtitle rs-confirmation-subtitle" aria-live="polite">It will become visible once included in a block.</p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown rs-confirmation-countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>
</article>`;
	},

	completeOverlay() {
		return `
<article class="listing-progress complete" aria-labelledby="listing-progress-complete-title">
  <div class="stack">
    <div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>
    <h2 class="title" id="listing-progress-complete-title">Listing Successful</h2>
    <p class="lead">You have successfully added an item to your Saito Store.</p>
    <button type="button" class="saito-button-primary" data-action="listing-continue">Continue</button>
  </div>
</article>`;
	}
};
