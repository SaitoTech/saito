const { buildSendPanelOverlay } = require('./send_panel.template');

function selectedNftSummaryHtml({ title = '', type = '', units = '—', imageStyle = '' }) {
  const thumbStyle = imageStyle ? ` style="${imageStyle}"` : '';
  return `
<div class="rs-publish-nft-selected">
  <div class="rs-publish-nft-selected-thumb"${thumbStyle}></div>
  <div class="rs-publish-nft-selected-meta">
    <div class="rs-publish-nft-selected-title">${title || '—'}</div>
    <div class="rs-publish-nft-selected-row">
      <span class="rs-publish-nft-selected-label">Type</span>
      <span class="rs-publish-nft-selected-value">${type || '—'}</span>
    </div>
    <div class="rs-publish-nft-selected-row">
      <span class="rs-publish-nft-selected-label">Available</span>
      <span class="rs-publish-nft-selected-value rs-publish-nft-available">${units}</span>
    </div>
  </div>
</div>`;
}

module.exports = {
  sendOverlay({ p2shAddress, fee, selectedSummary = '' }) {
    const formFieldsHtml = `
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Script Hash</span>
        <div class="rs-publish-input-copy-row">
          <input type="text" class="rs-publish-input rs-publish-address" readonly value="${p2shAddress}" spellcheck="false" />
          <button type="button" class="rs-publish-copy-btn" data-action="publish-copy-hash" title="Copy script hash" aria-label="Copy script hash">
            <i class="fa-solid fa-copy rs-publish-copy-icon" aria-hidden="true"></i>
          </button>
        </div>
      </label>
      <div class="rs-publish-field">
        <span class="rs-publish-field-label">Selected NFT</span>
        <div class="rs-publish-nft-selected-slot">
          ${selectedSummary || selectedNftSummaryHtml({})}
        </div>
      </div>
      <div class="rs-publish-field">
        <span class="rs-publish-field-label">NFT Units</span>
        <div class="rs-publish-nft-amount-row">
          <input type="text" class="rs-publish-input rs-publish-nft-amount" inputmode="numeric" value="1" spellcheck="false" disabled />
          <button type="button" class="rs-btn rs-btn-secondary rs-publish-nft-max-btn" data-action="publish-nft-max" disabled>MAX</button>
        </div>
      </div>
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Fee (SAITO)</span>
        <input type="text" class="rs-publish-input rs-publish-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
      </label>`;

    const leftPanelHtml = `
      <div class="rs-publish-nft-list-panel">
        <div class="rs-publish-nft-list send-nft-list"></div>
      </div>`;

    return buildSendPanelOverlay({
      extraRootClass: 'rs-publish-nft-send',
      leftPanelHtml,
      leftColumnClass: 'rs-publish-send-nft-list',
      formFieldsHtml,
      actionButtonHtml:
        '<button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="publish-nft-broadcast" disabled>Publish</button>'
    });
  },

  selectedNftSummaryHtml
};
