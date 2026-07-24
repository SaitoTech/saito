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

/** Seller admin sidebar — vertical nav matching marketplace item chrome. */
function dashboardTemplate({ dashboardView = 'store-admin' } = {}) {
	const view = ['store-admin', 'active', 'sold'].includes(dashboardView)
		? dashboardView
		: 'store-admin';

	const item = (id, label) => {
		const on = view === id;
		const active = on ? ' active' : '';
		const current = on ? 'page' : 'false';
		return `<li class="item${active}" role="button" tabindex="0" data-view="${id}" aria-current="${current}">${label}</li>`;
	};

	return `
    <ul class="list saito-menu-select-subtle" role="list">
      ${item('store-admin', 'Store Admin')}
      ${item('active', 'Active Listings')}
      ${item('sold', 'Sold Listings')}
    </ul>
  `;
}

module.exports = browseTemplate;
module.exports.browse = browseTemplate;
module.exports.dashboard = dashboardTemplate;
module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.STORE_CATEGORY_LIST = STORE_CATEGORY_LIST;
module.exports.categoryViewKey = categoryViewKey;
