module.exports = ({ title = 'Your Store', shareUrl = '', loading = true } = {}) => {
	const urlHtml = shareUrl
		? `<p class="storefront-url" data-storefront-url>${shareUrl}</p>`
		: '';

	const status = loading
		? `<div class="storefront-status" data-storefront-status role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      </div>`
		: `<div class="storefront-status" data-storefront-status hidden></div>`;

	return `
    <section class="hero storefront-hero">
      <div class="copy">
        <h1>${title}</h1>
        ${urlHtml}
      </div>
    </section>
    <section class="catalog storefront-catalog">
      ${status}
      <div class="teasers" aria-label="Creator listings"></div>
    </section>
  `;
};
