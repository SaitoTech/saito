function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = (info = {}) => {
  const instruction = String(info.instruction || '');
  const code_label = info.code_label || info.panel_label || info.panel_name || 'Code entry';
  const code_index = Number.isInteger(info.code_index)
    ? info.code_index
    : Number.isInteger(info.panel_index)
      ? info.panel_index
      : 0;
  const card_slug = info.card_slug || '';
  const card_number = info.card_number || '';

  return `
    <div class="tscardgen-nft-event-help saito-overlay-form retain-surface">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">Additional NFT Code Entry</div>
      </div>
      <p class="tscardgen-modal-copy">
        This is a separate code entry on the same card
        (<strong>${escapeHtml(code_label)}</strong>, index
        <code>${escapeHtml(String(code_index))}</code>).
        Queue the instruction below to run it from the shared game queue.
      </p>
      <div class="tscardgen-nft-event-meta">
        <div><span class="tscardgen-nft-event-meta-label">Card slug</span> ${escapeHtml(card_slug)}</div>
        <div><span class="tscardgen-nft-event-meta-label">Card number</span> ${escapeHtml(card_number || '—')}</div>
        <div><span class="tscardgen-nft-event-meta-label">Code index</span> ${escapeHtml(String(code_index))} <span class="tscardgen-nft-event-meta-note">(zero-based)</span></div>
      </div>
      <pre class="tscardgen-nft-event-instruction" tabindex="0"><code>${escapeHtml(
        instruction
      )}</code></pre>
      <p class="tscardgen-nft-event-legend">
        Format: <code>NFT_EVENT</code> · application-level card id · zero-based code index · optional arguments.
        Replace <code>CARD_ID</code> with this card's <code>options.nfts[].id</code> in the game.
        Optional trailing fields become <code>args[0]</code>, <code>args[1]</code>, … inside the script.
      </p>
      <div class="tscardgen-modal-actions">
        <button type="button" class="saito-button-secondary" data-action="close">Close</button>
        <button type="button" class="saito-button-primary" data-action="copy">Copy instruction</button>
      </div>
    </div>
  `;
};
