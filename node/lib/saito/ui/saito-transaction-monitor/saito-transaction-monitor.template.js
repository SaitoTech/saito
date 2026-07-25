module.exports = {
	pending({ title = '', lead = '', subtitle = '' } = {}) {
		return `
<article class="saito-transaction-monitor" aria-live="polite">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title">${title}</h2>
    <p class="lead">${lead}</p>
    <p class="subtitle">${subtitle}</p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>
</article>`;
	},

	complete({ title = '', lead = '', actionLabel = 'Continue' } = {}) {
		return `
<article class="saito-transaction-monitor">
  <div class="stack">
    <div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>
    <h2 class="title">${title}</h2>
    <p class="lead">${lead}</p>
    <button type="button" class="saito-button-primary" data-action="continue">${actionLabel}</button>
  </div>
</article>`;
	}
};
