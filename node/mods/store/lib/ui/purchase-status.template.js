function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = (purchase = null) => {
  if (!purchase || purchase.phase === 'dismissed') {
    return `<aside class="purchase-status" data-purchase-status hidden></aside>`;
  }

  const isComplete = purchase.phase === 'complete';
  const isFulfilling = purchase.phase === 'fulfilling';
  const title = escapeHtml(purchase.status || (isComplete ? 'NFT received!' : 'Purchasing NFT…'));
  const detail = escapeHtml(purchase.detail || '');
  // Confirmation waiting is Transaction Monitor only — no "View progress" during confirming.
  let actions = '';
  if (isComplete) {
    actions = `<div class="actions">
        <button type="button" class="saito-button-primary" data-action="view-nfts">View in My NFTs</button>
        <button type="button" class="saito-button-secondary" data-action="dismiss">Dismiss</button>
      </div>`;
  } else if (isFulfilling) {
    actions = `<div class="actions">
        <button type="button" class="saito-button-secondary" data-action="show-progress">View progress</button>
      </div>`;
  }

  const spinner = isComplete
    ? `<div class="success" aria-hidden="true"><i class="fas fa-check"></i></div>`
    : `<div class="saito-spinner" aria-hidden="true"></div>`;

  return `
    <aside class="purchase-status is-${escapeHtml(purchase.phase)}" data-purchase-status aria-live="polite">
      <div class="body">
        ${spinner}
        <div class="copy">
          <p class="title">${title}</p>
          ${detail ? `<p class="detail">${detail}</p>` : ''}
        </div>
        ${actions}
      </div>
    </aside>
  `;
};
