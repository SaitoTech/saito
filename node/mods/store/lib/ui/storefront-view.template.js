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

function copyControl() {
	return `
    <button type="button" class="saito-icon-button" data-action="copy-url" title="Copy storefront URL" aria-label="Copy storefront URL">
      <i class="fas fa-copy" aria-hidden="true"></i>
    </button>`;
}

function dashboard({ shareUrl = '', showSuccess = false } = {}) {
	const url = escapeHtml(shareUrl);
	const success = showSuccess ? successBanner() : '';

	const urlRow = shareUrl
		? `<div class="storefront-url-row">
          <a class="storefront-url" data-storefront-url href="${url}" title="${url}">${url}</a>
          ${copyControl()}
        </div>`
		: '';

	return `
    ${success}
    <section class="seller-home">
      <h2 class="title">Welcome to your Store</h2>
      <p class="body">Listings are published onto the Saito Network. Share the following link with your customers to give them access to an easy UI for browsing.</p>
      ${urlRow}
      <p class="body">Visit this page anytime to create new listings, manage existing ones, and review your sales history.</p>
      <div class="actions">
        <button type="button" class="saito-button-primary" data-action="list-item">+ Add New Listing</button>
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

function adminDenied() {
	return `
    <section class="admin-denied" role="status">
      <p class="body">Please login with the appropriate account to manage this Store.</p>
    </section>
  `;
}

function catalog({ loading = true } = {}) {
	const status = loading
		? `<div class="storefront-status" data-storefront-status role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      </div>`
		: `<div class="storefront-status" data-storefront-status hidden></div>`;

	return `
    <section class="catalog storefront-catalog">
      ${status}
      <div class="teasers" aria-label="Creator listings"></div>
    </section>
  `;
}

module.exports = ({
	title = 'Your Store',
	description = '',
	shareUrl = '',
	loading = true,
	isDashboard = false,
	adminSection = 'home',
	adminDenied: denied = false,
	showSuccess = false
} = {}) => {
	if (denied) {
		return adminDenied();
	}

	if (isDashboard && adminSection === 'active') {
		return `
    <div class="storefront-admin">
      ${catalog({ loading })}
    </div>
  `;
	}

	if (isDashboard) {
		return `
    <div class="storefront-admin">
      ${dashboard({ shareUrl, showSuccess })}
    </div>
  `;
	}

	return `
    ${publicHero({ title, description })}
    ${catalog({ loading })}
  `;
};
