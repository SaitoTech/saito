const { STORE_CATEGORIES, STORE_CATEGORY_LIST, categoryViewKey } = require('../categories');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Public marketplace sidebar. Featured is a page, not a saved category. */
function browseTemplate({
  showMyStore = false,
  categories = [],
  featuredName = 'Featured',
  featuredVisible = true
} = {}) {
  const categoryItems = (Array.isArray(categories) ? categories : [])
    .map((category) => {
      const id = String(category.category_id || category.id || '');
      const name = String(category.name || id);
      return `<li class="item" role="button" tabindex="0" data-view="${escapeHtml(id)}" data-category="${escapeHtml(id)}">${escapeHtml(name)}</li>`;
    })
    .join('\n      ');

  const footerItem = showMyStore
    ? `<li class="item" role="button" tabindex="0" data-view="my-store">My Saito Store</li>`
    : `<li class="item" role="button" tabindex="0" data-action="list-item">List Item for Sale</li>`;

  return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item moderation-item" id="store-menu-moderate" hidden role="button" tabindex="-1" data-view="moderation" aria-hidden="true">
        <span class="label">Moderate</span>
        <span class="saito-notification-dot badge" data-moderation-count aria-hidden="true">0</span>
      </li>
      ${
        featuredVisible
          ? `<li class="item" role="button" tabindex="0" data-view="featured">${escapeHtml(featuredName || 'Featured')}</li>`
          : ''
      }
      ${categoryItems}
      <li class="divider" role="separator"></li>
      ${footerItem}
    </ul>
  `;
}

/** Seller admin sidebar — Admin Home with indented children + View Store. */
function dashboardTemplate({ dashboardView = 'store-admin', showWithdrawals = false } = {}) {
  const view = ['store-admin', 'active', 'sold', 'withdrawals'].includes(dashboardView)
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
      ${showWithdrawals ? item('withdrawals', 'Withdrawals', { child: true }) : ''}
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
