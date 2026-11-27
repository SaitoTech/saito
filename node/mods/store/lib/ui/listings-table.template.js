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

module.exports = ({
  listings = [],
  caption = '',
  categoryNames = {},
  featuredIds = [],
  showFeatured = false
} = {}) => {
  const featured = new Set((featuredIds || []).map((id) => String(id || '').toLowerCase()));
  const rows = (listings || [])
    .map((summary) => {
      const signature = escapeHtml(summary.listing_signature || '');
      const title = escapeHtml(summary.returnTitle?.() || summary.title || 'Untitled Item');
      const categoryId = String(summary.category || '');
      const category = escapeHtml(
        categoryId ? categoryNames[categoryId] || categoryId : 'Featured'
      );
      const price = escapeHtml(summary.returnPrice?.() || '');
      const quantity = Number(summary.quantity_total ?? summary.quantity_available ?? 0) || 0;
      const created = escapeHtml(formatCreatedAt(summary.created_at));
      const nftId = String(summary.nft_id || '').toLowerCase();
      const featuredCell = showFeatured
        ? `<td><input type="checkbox" data-feature-nft="${escapeHtml(nftId)}" ${featured.has(nftId) ? 'checked' : ''} aria-label="Feature listing" /></td>`
        : '';
      return `
          <tr data-signature="${signature}">
            ${featuredCell}
            <td>${title}</td>
            <td>${category}</td>
            <td>${price || '—'}</td>
            <td>${quantity}</td>
            <td>${created}</td>
          </tr>`;
    })
    .join('');

  const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';

  return `
    <div class="listings-table-wrap">
      <table class="listings-table">
        ${captionHtml}
        <thead>
          <tr>
            ${showFeatured ? '<th scope="col">Featured</th>' : ''}
            <th scope="col">Title</th>
            <th scope="col">Category</th>
            <th scope="col">Price</th>
            <th scope="col">Quantity</th>
            <th scope="col">Created_at</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
};
