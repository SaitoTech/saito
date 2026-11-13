module.exports = ({
  loading = false,
  error = null,
  signature = '',
  status = '',
  blockId = '',
  blockHash = '',
  blockHref = '',
  blockInput = '',
  transactionId = '',
  longestChain = '',
  createdAt = ''
}) => {
  let statusHtml = '';
  if (loading) {
    statusHtml = `<p class="explorer-address-status">Looking up transaction…</p>`;
  } else if (error) {
    statusHtml = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to look up transaction</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
  }

  const statusSlug = status ? status.toLowerCase().replace(/\s+/g, '-') : '';
  const statusPanel =
    status && !loading
      ? `
      <div class="explorer-utxo-status-panel explorer-utxo-status-${statusSlug}" role="status">
        <p class="explorer-utxo-status-value">${status}</p>
      </div>
    `
      : '';

  const visitBlockHtml =
    blockHref && blockInput
      ? `
      <p class="explorer-utxo-block-visit">
        <a href="${blockHref}" class="explorer-link explorer-utxo-block-link" data-block-input="${blockInput}">visit the block containing this transaction...</a>
      </p>
    `
      : '';

  const fields = [];
  if (!loading && !error && status && status !== 'NOT FOUND' && status !== 'UNCONFIRMED') {
    fields.push({ label: 'block id', value: blockId || '—' });
    fields.push({
      label: 'block hash',
      value: blockHash || '—',
      valueClass: 'explorer-tx-meta-value-mono'
    });
    fields.push({ label: 'transaction id', value: transactionId || '—' });
    fields.push({ label: 'longest chain', value: longestChain || '—' });
    fields.push({ label: 'created', value: createdAt || '—' });
  }

  const fieldsHtml = fields.length
    ? `
      <dl class="explorer-tx-meta explorer-utxo-fields">
        ${fields
          .map(
            (field) => `
          <dt class="explorer-tx-meta-label">${field.label}:</dt>
          <dd class="explorer-tx-meta-value ${field.valueClass || ''}">${field.value}</dd>
        `
          )
          .join('')}
      </dl>
    `
    : '';

  return `
    <main class="explorer-content explorer-view-panel explorer-address-page explorer-utxo-page">
      <div class="explorer-container explorer-stack">
        <div class="explorer-address-header">
          <button type="button" class="explorer-back-link" data-nav="home" aria-label="Back to explorer home">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="explorer-address-header-text">
            <h1 class="explorer-page-title">Transaction</h1>
            ${signature ? `<p class="explorer-address-key-raw explorer-mono">${signature}</p>` : ''}
          </div>
        </div>

        <div class="explorer-address-dashboard explorer-card explorer-card-padded">
          ${visitBlockHtml}
          ${statusHtml}
          ${statusPanel}
          ${fieldsHtml}
        </div>
      </div>
    </main>
  `;
};
