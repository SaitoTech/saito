module.exports = ({
	title = 'Your Store',
	description = '',
	shareUrl = '',
	loading = true,
	showCopy = false,
	showViewSelect = false,
	activeView = 'active'
} = {}) => {
	const viewSelect = showViewSelect
		? `<select class="saito-form-select storefront-view-select" data-action="store-view" aria-label="Store view">
          <option value="active"${activeView === 'active' ? ' selected' : ''}>Active Listings</option>
          <option value="sold"${activeView === 'sold' ? ' selected' : ''}>Already Sold</option>
        </select>`
		: '';

	const descriptionHtml = description
		? `<p class="description">${description}</p>`
		: '';

	const urlRow =
		shareUrl
			? `<div class="storefront-url-row">
        <a class="saito-text-link storefront-url" data-storefront-url href="${shareUrl}" title="${shareUrl}">${shareUrl}</a>
        ${
					showCopy
						? `<button type="button" class="saito-icon-button" data-action="copy-url" aria-label="Copy storefront URL" title="Copy URL">
            <i class="fas fa-copy" aria-hidden="true"></i>
          </button>`
						: ''
				}
      </div>`
			: '';

	const status = loading
		? `<div class="storefront-status" data-storefront-status role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      </div>`
		: `<div class="storefront-status" data-storefront-status hidden></div>`;

	return `
    <section class="hero storefront-hero">
      <div class="toolbar-row">
        <h2 class="title">${title}</h2>
        ${viewSelect}
      </div>
      ${descriptionHtml}
      ${urlRow}
    </section>
    <section class="catalog storefront-catalog">
      ${status}
      <div class="teasers" aria-label="Creator listings"></div>
    </section>
  `;
};
