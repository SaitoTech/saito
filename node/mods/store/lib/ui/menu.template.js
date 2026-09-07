const { STORE_CATEGORIES, STORE_CATEGORY_LIST, categoryViewKey } = require('../categories');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Public marketplace sidebar — All Listings is a normal category row. */
function browseTemplate({ showMyStore = false } = {}) {
  const categoryItems = STORE_CATEGORY_LIST.map((category) => {
    const view = categoryViewKey(category);
    return `<li class="item" role="button" tabindex="0" data-view="${view}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</li>`;
  }).join('\n      ');

  const footerItem = showMyStore
    ? `<li class="item" role="button" tabindex="0" data-view="my-store">My Saito Store</li>`
    : `<li class="item" role="button" tabindex="0" data-action="list-item">List Item for Sale</li>`;

  return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="all" data-category="">All Listings</li>
      ${categoryItems}
      <li class="divider" role="separator"></li>
      ${footerItem}
    </ul>
  `;
}

/** Seller admin sidebar — Admin Home with indented children + View Store. */
function dashboardTemplate({ dashboardView = 'store-admin' } = {}) {
  const view = ['store-admin', 'active', 'sold'].includes(dashboardView)
    ? dashboardView
    : 'store-admin';

  const item = (id, label, { child = false } = {}) => {
    const on = view === id;
    const active = on ? ' active' : '';
    const current = on ? 'page' : 'false';
    const childClass = child ? ' child' : '';
    const caret = child
      ? `<span class="caret" aria-hidden="true">&gt;</span>`
      : '';
    return `<li class="item${childClass}${active}" role="button" tabindex="0" data-view="${id}" aria-current="${current}">${caret}<span class="label">${label}</span></li>`;
  };

  return `
    <ul class="list saito-menu-select-subtle" role="list">
      ${item('store-admin', 'Admin Home')}
      ${item('active', 'Listings', { child: true })}
      ${item('sold', 'Sales', { child: true })}
      <li class="item child" role="button" tabindex="0" data-action="settings">
        <span class="caret" aria-hidden="true">&gt;</span>
        <span class="label">Settings</span>
      </li>
      <li class="item" role="button" tabindex="0" data-view="view-store">
        <span class="label">View Store</span>
      </li>
    </ul>
  `;
}

module.exports = browseTemplate;
module.exports.browse = browseTemplate;
module.exports.dashboard = dashboardTemplate;
module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.STORE_CATEGORY_LIST = STORE_CATEGORY_LIST;
module.exports.categoryViewKey = categoryViewKey;
