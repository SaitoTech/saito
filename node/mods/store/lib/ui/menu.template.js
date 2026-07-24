const { STORE_CATEGORIES, STORE_CATEGORY_LIST, categoryViewKey } = require('../categories');

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Public marketplace sidebar — All Listings is a normal category row. */
function browseTemplate() {
	const categoryItems = STORE_CATEGORY_LIST.map((category) => {
		const view = categoryViewKey(category);
		return `<li class="item" role="button" tabindex="0" data-view="${view}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</li>`;
	}).join('\n      ');

	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="all" data-category="">All Listings</li>
      ${categoryItems}
      <li class="divider" role="separator"></li>
    </ul>
    <button type="button" class="store-list-for-sale" data-action="list-item">List Item for Sale</button>
  `;
}

/** Seller admin sidebar — isolated from marketplace chrome. */
function dashboardTemplate({ storeMode = 'active' } = {}) {
	const activeSelected = storeMode === 'sold' ? '' : ' selected';
	const soldSelected = storeMode === 'sold' ? ' selected' : '';

	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="my-store">My Saito Store</li>
      <li class="divider" role="separator"></li>
    </ul>
    <select class="saito-form-select mode-select" data-action="store-mode" aria-label="Store listings filter">
      <option value="active"${activeSelected}>Active Listings</option>
      <option value="sold"${soldSelected}>Completed Sales</option>
    </select>
    <div class="divider" role="separator"></div>
    <button type="button" class="saito-button-primary" data-action="list-item">List Another Item</button>
  `;
}

module.exports = browseTemplate;
module.exports.browse = browseTemplate;
module.exports.dashboard = dashboardTemplate;
module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.STORE_CATEGORY_LIST = STORE_CATEGORY_LIST;
module.exports.categoryViewKey = categoryViewKey;
