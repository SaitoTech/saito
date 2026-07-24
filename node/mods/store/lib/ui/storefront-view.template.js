module.exports = ({
	title = 'Your Store',
	loading = true,
	showViewSelect = false
} = {}) => {
	const header = showViewSelect
		? ''
		: `<section class="hero storefront-hero">
        <h2 class="title">${title}</h2>
      </section>`;

	const status = loading
		? `<div class="storefront-status" data-storefront-status role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      </div>`
		: `<div class="storefront-status" data-storefront-status hidden></div>`;

	return `
    ${header}
    <section class="catalog storefront-catalog">
      ${status}
      <div class="teasers" aria-label="Creator listings"></div>
    </section>
  `;
};
