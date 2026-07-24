const { STORE_CATEGORIES, STORE_CATEGORY_LIST, categoryViewKey } = require('../categories');

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

module.exports = () => {
	const categoryItems = STORE_CATEGORY_LIST.map((category) => {
		const view = categoryViewKey(category);
		return `<li class="item" role="button" tabindex="0" data-view="${view}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</li>`;
	}).join('\n      ');

	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="all" data-category="">All Listings</li>
      ${categoryItems}
      <li class="divider" role="separator"></li>
      <li class="item" role="button" tabindex="0" data-view="my-listings">My Listings</li>
    </ul>
  `;
};

module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.STORE_CATEGORY_LIST = STORE_CATEGORY_LIST;
module.exports.categoryViewKey = categoryViewKey;
