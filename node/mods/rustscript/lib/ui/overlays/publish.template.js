const { buildSendPanelOverlay } = require('./send_panel.template');
const { buildRustscriptOverlay } = require('./overlay.shell');

module.exports = {
  choiceOverlay() {
    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-publish-choice',
      title: 'What do you want to secure?',
      titleClass: 'rs-overlay-title-choice',
      bodyHtml: `
        <div class="rs-publish-asset-grid">
          <button type="button" class="rs-btn rs-btn-card rs-publish-asset-card rs-publish-asset-saito" data-action="publish-saito" aria-label="Secure SAITO">
            <span class="rs-publish-asset-media">
              <img src="/rustscript/img/red_cube.jpg" alt="" class="rs-publish-asset-img" aria-hidden="true" />
              <span class="rs-publish-asset-name">SAITO</span>
            </span>
          </button>
          <button type="button" class="rs-btn rs-btn-card rs-publish-asset-card rs-publish-asset-nft" data-action="publish-nft" aria-label="Secure NFT">
            <span class="rs-publish-asset-media">
              <img src="/rustscript/img/multi_cube.jpg" alt="" class="rs-publish-asset-img" aria-hidden="true" />
              <span class="rs-publish-asset-name">NFT</span>
            </span>
          </button>
        </div>
      `
    });
  },

  sendOverlay({ scriptDisplay, p2shAddress, amount, fee }) {
    const formFieldsHtml = `
      <label class="rs-publish-field">
        <span class="rs-overlay-label rs-publish-field-label">Script Hash</span>
        <div class="rs-publish-input-copy-row">
          <input type="text" class="saito-input rs-publish-input rs-publish-address" readonly value="${p2shAddress}" spellcheck="false" />
          <button type="button" class="rs-copy-btn rs-publish-copy-btn" data-action="publish-copy-hash" title="Copy script hash" aria-label="Copy script hash">
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
          </button>
        </div>
      </label>
      <div class="rs-publish-field-row">
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-overlay-label rs-publish-field-label">Amount (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-publish-amount" inputmode="decimal" value="${amount}" spellcheck="false" />
        </label>
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-overlay-label rs-publish-field-label">Fee (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-publish-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
        </label>
      </div>`;

    return buildSendPanelOverlay({
      scriptDisplay,
      formFieldsHtml,
      actionButtonHtml:
        '<button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="publish-broadcast">Publish</button>'
    });
  }
};
