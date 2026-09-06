function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSaleDate(ms) {
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

function formatSaleAmount(app, nolan) {
  try {
    const amount = BigInt(nolan ?? 0);
    if (amount > 0n && app?.wallet?.convertNolanToSaito) {
      return `${app.wallet.convertNolanToSaito(amount)} SAITO`;
    }
    if (amount > 0n) {
      return String(amount);
    }
  } catch (err) {
    // fall through
  }
  return '';
}

module.exports = ({ listings = [], caption = 'Sales' } = {}) => {
  const rows = (listings || [])
    .map((summary) => {
      const app = summary.app;
      const signature = escapeHtml(summary.listing_signature || '');
      const title = escapeHtml(summary.returnTitle?.() || summary.title || 'Untitled Item');
      const quantity_sold = Math.max(0, Number(summary.quantity_sold ?? 0) || 0);
      const price = escapeHtml(summary.returnPrice?.() || '');
      let total = '';
      try {
        total = formatSaleAmount(app, BigInt(summary.price ?? 0) * BigInt(quantity_sold));
      } catch (err) {
        total = '';
      }
      const sold_at = escapeHtml(formatSaleDate(summary.sold_at));
      const seller_note = String(summary.seller_note || '').trim();
      const note_html = seller_note
        ? `<div class="sales-seller-note">${escapeHtml(seller_note)}</div>`
        : '';
      return `
          <tr data-signature="${signature}">
            <td class="sales-title">${title}</td>
            <td>${quantity_sold || '—'}</td>
            <td>${price || '—'}</td>
            <td>${escapeHtml(total) || '—'}</td>
            <td class="sales-note">${note_html}</td>
            <td>${sold_at}</td>
          </tr>`;
    })
    .join('');

  const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';

  return `
    <div class="listings-table-wrap">
      <table class="listings-table sales-table">
        ${captionHtml}
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Qty Sold</th>
            <th scope="col">Price</th>
            <th scope="col">Total</th>
            <th scope="col">Note</th>
            <th scope="col">Date Sold</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
};
