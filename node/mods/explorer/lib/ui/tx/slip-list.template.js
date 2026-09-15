function utxoBadge(slip) {
  if (!slip.utxoKeyRaw) {
    return '';
  }
  return `<button type="button" class="explorer-slip-badge explorer-slip-utxokey-badge explorer-copy-btn" data-copy="${slip.utxoKeyRaw}" title="${slip.utxoKeyRaw}" aria-label="Copy UTXO KEY ${slip.utxoKeyRaw}">UTXO KEY</button>`;
}

function slipRow(slip) {
  const created =
    slip.createdBlockHref && slip.createdBlockId
      ? `<a href="${slip.createdBlockHref}" class="explorer-link explorer-tx-block-link explorer-slip-value" data-block-input="${slip.createdBlockId}" title="${slip.createdBlockHashRaw || slip.createdBlockId}">Block ${slip.createdBlockLabel}</a>`
      : `<span class="explorer-slip-value">Block ${slip.createdBlockLabel}</span>`;

  return `
    <article class="explorer-slip-row explorer-slip-row-${slip.role}">
      <span class="explorer-slip-badge explorer-slip-ordinal">${slip.ordinal}</span>
      <div class="explorer-slip-pubkey">
        <span class="explorer-slip-kicker">Public Key</span>
        <div class="explorer-slip-value-row">
          ${slip.publicKey}
        </div>
      </div>
      <div class="explorer-slip-flags">
        <span class="explorer-slip-badge explorer-slip-type-badge">${slip.slipType}</span>
        ${utxoBadge(slip)}
      </div>
      <div class="explorer-slip-created">
        <span class="explorer-slip-kicker">Created In</span>
        <div class="explorer-slip-value-row">
          ${created}
        </div>
      </div>
    </article>
  `;
}

module.exports = (slips = [], direction = 'From') => {
  const hasSlips = slips.length > 0;
  if (!hasSlips) {
    const message =
      direction.toLowerCase() === 'to'
        ? 'There are no outputs in this transaction.'
        : 'There are no inputs in this transaction.';
    return { hasSlips: false, html: `<p class="explorer-tx-empty-line">${message}</p>` };
  }

  return {
    hasSlips: true,
    html: `<div class="explorer-slip-list">${slips.map(slipRow).join('')}</div>`
  };
};
