const { buildRustscriptOverlay } = require('./overlay.shell');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  spendSaitoOverlay({ availableDisplay = '' } = {}) {
    return buildRustscriptOverlay({
      className: 'rs-overlay-prompt rs-spend-output rs-spend-saito',
      title: 'Create Output',
      titleClass: 'rs-spend-title',
      bodyHtml: `
        <div class="rs-spend-available">
          <span class="rs-overlay-label">Available</span>
          <div class="rs-spend-available-value">${escapeHtml(availableDisplay)}</div>
        </div>

        <label class="rs-spend-field">
          <span class="rs-spend-field-head">
            <span class="rs-overlay-label">Recipient</span>
            <button type="button" class="saito-text-link rs-spend-use-mine">use my public key</button>
          </span>
          <input type="text" class="saito-input rs-publish-input rs-spend-recipient" spellcheck="false" autocomplete="off" />
        </label>

        <label class="rs-spend-field">
          <span class="rs-overlay-label">Amount</span>
          <div class="rs-spend-amount-row">
            <input type="text" class="saito-input rs-publish-input rs-spend-amount" inputmode="decimal" spellcheck="false" autocomplete="off" />
            <button type="button" class="rs-btn rs-btn-secondary rs-spend-max-btn" data-action="spend-max">MAX</button>
          </div>
        </label>

        <p class="rs-prompt-validation rs-spend-error" hidden role="alert"></p>
      `,
      actionsHtml: `<button type="button" class="rs-btn rs-btn-primary" data-action="create-output">CREATE OUTPUT</button>`,
      actionsClass: 'rs-overlay-actions-end'
    });
  },

  transferNftOverlay() {
    return buildRustscriptOverlay({
      className: 'rs-overlay-prompt rs-spend-output rs-spend-nft',
      title: 'Transfer NFT',
      titleClass: 'rs-spend-title',
      bodyHtml: `
        <label class="rs-spend-field">
          <span class="rs-spend-field-head">
            <span class="rs-overlay-label">Recipient</span>
            <button type="button" class="saito-text-link rs-spend-use-mine">use my public key</button>
          </span>
          <input type="text" class="saito-input rs-publish-input rs-spend-recipient" spellcheck="false" autocomplete="off" />
        </label>
        <p class="rs-prompt-validation rs-spend-error" hidden role="alert"></p>
      `,
      actionsHtml: `<button type="button" class="rs-btn rs-btn-primary" data-action="transfer-nft">Transfer NFT</button>`,
      actionsClass: 'rs-overlay-actions-end'
    });
  }
};
