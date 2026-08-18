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

module.exports = ({ listings = [], caption = '' } = {}) => {
  const rows = (listings || [])
    .map((summary) => {
      const signature = escapeHtml(summary.listing_signature || '');
      const title = escapeHtml(summary.returnTitle?.() || summary.title || 'Untitled Item');
      const category = escapeHtml(summary.category || '');
      const price = escapeHtml(summary.returnPrice?.() || '');
      const quantity = Number(summary.quantity_total ?? summary.quantity_available ?? 0) || 0;
      const created = escapeHtml(formatCreatedAt(summary.created_at));
      return `
          <tr data-signature="${signature}">
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
