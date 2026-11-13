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

const { multiplyDecimalAmount, web3SaleTicker } = require('../web3-amount');

function formatSaitoAmount(app, nolan) {
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

function formatSaleAmount(app, summary, quantitySold) {
  const ticker = web3SaleTicker(summary?.web3_ticker);
  const unit = String(summary?.web3_amount || '').trim();
  if (ticker && unit) {
    const total = multiplyDecimalAmount(unit, quantitySold);
    if (total !== '') {
      return `${total} ${ticker}`;
    }
  }
  try {
    return formatSaitoAmount(app, BigInt(summary?.price ?? 0) * BigInt(quantitySold || 0));
  } catch (err) {
    return '';
  }
}

module.exports = ({ listings = [], caption = 'Sales' } = {}) => {
  const rows = (listings || [])
    .map((summary) => {
      const app = summary.app;
      const signature = escapeHtml(summary.listing_signature || '');
      const title = escapeHtml(summary.returnTitle?.() || summary.title || 'Untitled Item');
      const quantity_sold = Math.max(0, Number(summary.quantity_sold ?? 0) || 0);
      const total = formatSaleAmount(app, summary, quantity_sold);
      const sold_at = escapeHtml(formatSaleDate(summary.sold_at));
      const buyer = String(summary.buyer || '').trim();
      const seller_note = String(summary.seller_note || '').trim();

      let buyer_html = '—';
      if (buyer) {
        const note_html = seller_note
          ? `<div class="sales-seller-note">${escapeHtml(seller_note)}</div>`
          : '';
        buyer_html = `
            <div class="sales-buyer">
              <div class="sales-buyer-row">
                <span class="sales-buyer-address" title="${escapeHtml(buyer)}">${escapeHtml(buyer)}</span>
                <button type="button" class="saito-icon-button sales-buyer-copy" data-action="copy-buyer" data-buyer="${escapeHtml(buyer)}" title="Copy buyer address" aria-label="Copy buyer address">
                  <i class="fas fa-copy" aria-hidden="true"></i>
                </button>
              </div>
              ${note_html}
            </div>`;
      } else if (seller_note) {
        buyer_html = `<div class="sales-seller-note">${escapeHtml(seller_note)}</div>`;
      }

      return `
          <tr data-signature="${signature}">
            <td class="sales-title">${title}</td>
            <td>${quantity_sold || '—'}</td>
            <td>${escapeHtml(total) || '—'}</td>
            <td class="sales-buyer-cell">${buyer_html}</td>
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
            <th scope="col">Qty</th>
            <th scope="col">Total</th>
            <th scope="col">Buyer</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
};
