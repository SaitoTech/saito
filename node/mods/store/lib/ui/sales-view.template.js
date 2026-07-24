module.exports = ({
	title = 'Your Store',
	description = '',
	shareUrl = '',
	showCopy = false
} = {}) => {
	const descriptionHtml = description
		? `<p class="description">${description}</p>`
		: '';

	const urlRow = shareUrl
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

	return `
    <section class="hero storefront-hero">
      <div class="toolbar-row">
        <h2 class="title">${title}</h2>
        <select class="saito-form-select storefront-view-select" data-action="store-view" aria-label="Store view">
          <option value="active">Active Listings</option>
          <option value="sold" selected>Already Sold</option>
        </select>
      </div>
      ${descriptionHtml}
      ${urlRow}
    </section>
    <section class="catalog storefront-catalog sales-catalog">
      <p class="sales-placeholder">Sales history will appear here.</p>
    </section>
  `;
};
