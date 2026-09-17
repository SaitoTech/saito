module.exports = ({ loading = false, error = null, utxokey = '', status = '', slip = null }) => {
  let statusHtml = '';
  if (loading) {
    statusHtml = `<p class="explorer-address-status">Checking UTXO set…</p>`;
  } else if (error) {
    statusHtml = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to look up UTXO</p>
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
    slip?.blockHref && slip?.blockInput
      ? `
      <p class="explorer-utxo-block-visit">
        <a href="${slip.blockHref}" class="explorer-link explorer-utxo-block-link" data-block-input="${slip.blockInput}">visit the block containing this transaction output...</a>
      </p>
    `
      : '';

  const fields = [];
  if (slip) {
    fields.push({ label: 'type', value: slip.type || '—' });
    fields.push({ label: 'block id', value: slip.blockId || '—' });
    fields.push({ label: 'transaction id', value: slip.transactionId || '—' });
    fields.push({ label: 'slip', value: slip.slipIndex || '—' });
    fields.push({
      label: 'public key',
      value: slip.publicKey || slip.publicKeyHex || '—',
      valueClass: 'explorer-utxo-public-key explorer-tx-meta-value-mono'
    });
    fields.push({ label: 'amount', value: slip.amountDisplay || slip.amount || '—' });
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
            <h1 class="explorer-page-title">UTXOKEY</h1>
            ${utxokey ? `<p class="explorer-address-key-raw explorer-mono">${utxokey}</p>` : ''}
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
