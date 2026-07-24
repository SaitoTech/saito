function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function successBanner() {
	return `
    <aside class="listing-success" data-listing-success role="status" aria-live="polite">
      <button type="button" class="saito-icon-button close" data-action="dismiss-success" aria-label="Dismiss">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <p class="title">Successful Listing!</p>
      <p class="body">Your listing is now live on the Saito Network.</p>
      <p class="body">If you'd like to modify its price, description or sales terms, you can do so at any time by opening your listing.</p>
    </aside>
  `;
}

function dashboard({ shareUrl = '', showSuccess = false } = {}) {
	const url = escapeHtml(shareUrl);
	const success = showSuccess ? successBanner() : '';

	const urlRow = shareUrl
		? `<div class="share">
        <p class="label">Store URL</p>
        <div class="storefront-url-row">
          <a class="saito-text-link storefront-url" data-storefront-url href="${url}" title="${url}">${url}</a>
          <button type="button" class="saito-button-secondary small" data-action="copy-url">Copy</button>
          <button type="button" class="saito-button-secondary small" data-action="edit-url" disabled title="Coming Soon">Edit</button>
        </div>
      </div>`
		: '';

	return `
    ${success}
    <section class="seller-home">
      <h2 class="title">Welcome to your Store</h2>
      <p class="body">This is your personal storefront on the Saito Network.</p>
      <p class="body">From here you can manage your listings, review completed sales, add additional items for sale, and share your storefront with anyone.</p>
      ${urlRow}
      <p class="body">Anyone with this link can browse everything you have listed for sale on the Saito Network. As you add or remove listings, this page updates automatically.</p>
      <div class="actions">
        <button type="button" class="saito-button-primary" data-action="list-item">List Another Item</button>
        <button type="button" class="saito-button-secondary" data-action="review-sales">Review Sales</button>
      </div>
    </section>
  `;
}

function publicHero({ title = 'Store', description = '' } = {}) {
	const descriptionHtml = description
		? `<p class="description">${description}</p>`
		: '';

	return `
    <section class="hero">
      <div class="toolbar-row">
        <h2 class="title">${title}</h2>
      </div>
      ${descriptionHtml}
    </section>
  `;
}

module.exports = ({
	title = 'Your Store',
	description = '',
	shareUrl = '',
	loading = true,
	isDashboard = false,
	showSuccess = false
} = {}) => {
	const header = isDashboard
		? dashboard({ shareUrl, showSuccess })
		: publicHero({ title, description });

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
