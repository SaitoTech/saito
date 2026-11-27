function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function identityTemplate({ name = '', publicKey = '' } = {}) {
  const safeName = escapeHtml(name);
  const safeKey = escapeHtml(publicKey);
  return `
    <div class="store-header-identity">
      <div class="store-header-name">${safeName}</div>
      <div class="store-header-key" title="${safeKey}">${safeKey}</div>
    </div>
  `;
}

function catalogLinksTemplate({
  showHome = true,
  categories = [],
  active = 'featured'
} = {}) {
  const homeOn = showHome && (active === 'featured' || active === '');
  const home = showHome
    ? `<button type="button" class="store-nav-link${homeOn ? ' is-active' : ''}" data-nav="home" aria-current="${homeOn ? 'page' : 'false'}">Home</button>`
    : '';
  const links = (Array.isArray(categories) ? categories : [])
    .map((category) => {
      const id = String(category?.category_id || category?.id || '').trim();
      if (!id) {
        return '';
      }
      const name = String(category?.name || id);
      const on = id === active;
      return `<button type="button" class="store-nav-link${on ? ' is-active' : ''}" data-nav="category" data-category="${escapeHtml(id)}" aria-current="${on ? 'page' : 'false'}">${escapeHtml(name)}</button>`;
    })
    .join('');
  return home + links;
}

module.exports = identityTemplate;
module.exports.identityTemplate = identityTemplate;
module.exports.catalogLinksTemplate = catalogLinksTemplate;
