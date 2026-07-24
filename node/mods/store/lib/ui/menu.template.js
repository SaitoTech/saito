const { STORE_CATEGORIES, STORE_CATEGORY_LIST, categoryViewKey } = require('../categories');

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

module.exports = ({ shareUrl = '' } = {}) => {
	const categoryItems = STORE_CATEGORY_LIST.map((category) => {
		const view = categoryViewKey(category);
		return `<li class="item" role="button" tabindex="0" data-view="${view}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</li>`;
	}).join('\n      ');

	const shareControl = shareUrl
		? `<button type="button" class="saito-button-secondary sidebar-action share-control" data-action="share-storefront" aria-label="Share storefront" title="Share storefront">
            <span>Share</span>
            <i class="fa-solid fa-copy copy-icon" aria-hidden="true"></i>
            <i class="fa-solid fa-share-nodes share-icon" aria-hidden="true"></i>
          </button>
          <span data-storefront-url hidden>${escapeHtml(shareUrl)}</span>`
		: '';

	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="all" data-category="">All Listings</li>
      ${categoryItems}
      <li class="divider" role="separator"></li>
      <li class="my-listings-box saito-sidebar-element">
        <select class="saito-form-select storefront-view-select" data-action="store-view" aria-label="Listing status">
          <option value="active">Active</option>
          <option value="sold">Sold</option>
        </select>
        ${shareControl}
        <a class="saito-button-secondary sidebar-action guide-link" href="https://wiki.saito.io" target="_blank" rel="noopener noreferrer">
          <span>Guide</span>
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
      </li>
      <li class="item" role="button" tabindex="0" data-action="toggle-store-view" data-target-view="my-listings">My Listings</li>
    </ul>
  `;
};

module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.STORE_CATEGORY_LIST = STORE_CATEGORY_LIST;
module.exports.categoryViewKey = categoryViewKey;
