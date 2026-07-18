const { buildSendPanelOverlay } = require('./send_panel.template');

module.exports = {
  choiceOverlay() {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-choice">
  <div class="rs-publish-workspace-inner">
    <h2 class="rs-publish-title rs-publish-title-choice">What do you want to secure?</h2>
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
  </div>
</div>`;
  },

  sendOverlay({ scriptDisplay, p2shAddress, amount, fee }) {
    const formFieldsHtml = `
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Script Hash</span>
        <div class="rs-publish-input-copy-row">
          <input type="text" class="saito-input rs-publish-input rs-publish-address" readonly value="${p2shAddress}" spellcheck="false" />
          <button type="button" class="rs-publish-copy-btn" data-action="publish-copy-hash" title="Copy script hash" aria-label="Copy script hash">
            <i class="fa-solid fa-copy rs-publish-copy-icon" aria-hidden="true"></i>
          </button>
        </div>
      </label>
      <div class="rs-publish-field-row">
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-publish-field-label">Amount (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-publish-amount" inputmode="decimal" value="${amount}" spellcheck="false" />
        </label>
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-publish-field-label">Fee (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-publish-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
        </label>
      </div>`;

    return buildSendPanelOverlay({
      scriptDisplay,
      formFieldsHtml,
      actionButtonHtml:
        '<button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="publish-broadcast">Publish</button>'
    });
  },

  waitingOverlay({ p2shAddress }) {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-waiting is-success">
  <div class="rs-publish-workspace-inner rs-publish-waiting-inner">
  <div class="rs-publish-success-icon" aria-hidden="true">✓</div>
  <h2 class="rs-publish-title">Your script is now published on the network.</h2>
  <div class="rs-publish-success-actions">
    <button type="button" class="rs-btn rs-btn-primary rs-publish-success-btn rs-success-default" data-action="publish-new-script">Create New Script</button>
    <button type="button" class="rs-btn rs-btn-secondary rs-publish-success-btn" data-action="publish-copy-address">Copy P2SH Address</button>
    <button type="button" class="rs-btn rs-btn-secondary rs-publish-success-btn" data-action="publish-spend">Spend This Script</button>
    <button type="button" class="rs-btn rs-btn-secondary rs-publish-success-btn" data-action="publish-export">Export Transaction</button>
  </div>
  <p class="rs-publish-address-recap" data-address="${p2shAddress}">${p2shAddress}</p>
  </div>
</div>`;
  }
};
