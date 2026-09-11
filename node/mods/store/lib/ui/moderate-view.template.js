function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCreatedAt(ms) {
  const n = Number(ms);
  if (!n) {
    return '—';
  }
  const date = new Date(n);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function shortKey(key = '') {
  const value = String(key || '').trim();
  if (!value) {
    return 'anon';
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function truncateDescription(value = '', max = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '—';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max).trim()}…`;
}

function sortAttrs(column, sort, direction) {
  const on = column === sort;
  const aria = on ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const cls = on ? ' is-sorted' : '';
  return `class="is-sortable${cls}" data-sort="${column}" aria-sort="${aria}"`;
}

function table({
  listings = [],
  sort = 'created_at',
  direction = 'desc'
} = {}) {
  const dir = String(direction || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const rows = (listings || [])
    .map((summary) => {
      const signature = escapeHtml(summary.listing_signature || '');
      const seller = String(summary.seller || '').trim();
      const sellerLabel = escapeHtml(shortKey(seller));
      const sellerFull = escapeHtml(seller);
      const title = escapeHtml(summary.returnTitle?.() || summary.title || 'Untitled Item');
      const amount = Number(summary.quantity_total ?? summary.quantity_available ?? 0) || 0;
      const price = escapeHtml(summary.returnPrice?.() || '—');
      const created = escapeHtml(formatCreatedAt(summary.created_at));
      const description = escapeHtml(
        truncateDescription(summary.returnDescription?.() || summary.description || '')
      );
      return `
          <tr data-signature="${signature}">
            <td class="select-cell">
              <input type="checkbox" data-select-row aria-label="Select listing" />
            </td>
            <td class="user-cell">
              <button type="button" class="user-key" data-action="message-seller" data-public-key="${sellerFull}" title="${sellerFull}">${sellerLabel}</button>
            </td>
            <td>${title}</td>
            <td>${amount}</td>
            <td>${price}</td>
            <td>${created}</td>
            <td class="description-cell">
              <button type="button" class="description-link" data-action="preview-listing">${description}</button>
            </td>
          </tr>`;
    })
    .join('');

  return `
    <div class="listings-table-wrap">
      <table class="listings-table moderation-table">
        <caption>Listings awaiting moderation</caption>
        <thead>
          <tr>
            <th scope="col" class="select-cell">
              <input type="checkbox" data-select-all aria-label="Select all visible listings" />
            </th>
            <th scope="col" ${sortAttrs('seller', sort, dir)}>User</th>
            <th scope="col" ${sortAttrs('title', sort, dir)}>Title</th>
            <th scope="col" ${sortAttrs('quantity', sort, dir)}>Amount</th>
            <th scope="col" ${sortAttrs('price', sort, dir)}>Price</th>
            <th scope="col" ${sortAttrs('created_at', sort, dir)}>Created_at</th>
            <th scope="col" ${sortAttrs('description', sort, dir)}>Description</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
}

module.exports = ({ loading = true, denied = false } = {}) => {
  if (denied) {
    return `
    <section class="catalog storefront-catalog moderation-page" data-moderation-root>
      <p class="body" role="status">You are not authorized to moderate Store listings.</p>
    </section>
  `;
  }

  const status = loading
    ? `<div class="storefront-status" data-storefront-status role="status" aria-live="polite">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p>Loading listings…</p>
      </div>`
    : `<div class="storefront-status" data-storefront-status hidden></div>`;

  return `
    <section class="catalog storefront-catalog moderation-page" data-moderation-root>
      ${status}
      <div class="moderation-toolbar">
        <button type="button" class="saito-button-primary" data-action="approve" disabled>Approve</button>
        <button type="button" class="saito-button-secondary" data-action="reject" disabled>Reject</button>
      </div>
      <div data-listings-table></div>
      <div class="catalog-footer" data-catalog-footer hidden></div>
    </section>
  `;
};

module.exports.table = table;
module.exports.escapeHtml = escapeHtml;
