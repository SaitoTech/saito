function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      const nftId = String(summary.nft_id || '').toLowerCase();
      const featuredCell = showFeatured
        ? `<td class="listings-featured"><input type="checkbox" data-feature-nft="${escapeHtml(nftId)}" ${featured.has(nftId) ? 'checked' : ''} aria-label="Feature listing" /></td>`
        : '';
      return `
          <tr data-signature="${signature}">
            <td class="listings-title">${title}</td>
            <td class="listings-price">${price || '—'}</td>
            <td class="listings-quantity">${quantity}</td>
            <td class="listings-category">${category}</td>
            ${featuredCell}
          </tr>`;
    })
    .join('');

  const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';

  return `
    <div class="listings-table-wrap">
      <table class="listings-table admin-listings-table">
        ${captionHtml}
        <thead>
          <tr>
            <th scope="col" class="listings-title">Title</th>
            <th scope="col" class="listings-price">Price</th>
            <th scope="col" class="listings-quantity">Quantity</th>
            <th scope="col" class="listings-category">Category</th>
            ${showFeatured ? '<th scope="col" class="listings-featured">Featured</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
};
