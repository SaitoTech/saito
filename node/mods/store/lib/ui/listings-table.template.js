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

function approvalState(summary) {
  const approved = Number(summary?.approved ?? 0);
  if (approved === 1) {
    return { status: 'Approved', action: '' };
  }
  if (approved === 2) {
    return { status: 'Pending approval', action: '' };
  }
  if (approved === -1) {
    return { status: 'Rejected', action: 'Resubmit' };
  }
  return { status: 'Not submitted', action: 'Submit to Main Store' };
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
      const approval = approvalState(summary);
      const action = approval.action
        ? `<button type="button" class="saito-button-secondary listing-submit-main" data-action="submit-main-store">${escapeHtml(approval.action)}</button>`
        : '';
      return `
          <tr data-signature="${signature}">
            <td>${title}</td>
            <td>${category}</td>
            <td>${price || '—'}</td>
            <td>${quantity}</td>
            <td>${created}</td>
            <td class="listing-approval">
              <span class="listing-approval-status">${escapeHtml(approval.status)}</span>
              ${action}
            </td>
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
            <th scope="col">Main Store</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
};
