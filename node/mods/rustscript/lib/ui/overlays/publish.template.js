module.exports = {
  choiceOverlay() {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-choice">
  <div class="rs-publish-workspace-inner">
    <h2 class="rs-publish-title rs-publish-title-choice">What do you want to secure?</h2>
    <div class="rs-publish-asset-grid">
      <button type="button" class="rs-publish-asset-card rs-publish-asset-saito" data-action="publish-saito">
        <span class="rs-publish-asset-visual rs-publish-asset-visual-saito">
          <img src="/saito/img/saito-icon.png" alt="" class="rs-publish-asset-img" />
        </span>
        <span class="rs-publish-asset-name">SAITO</span>
      </button>
      <button type="button" class="rs-publish-asset-card rs-publish-asset-nft is-disabled" disabled aria-disabled="true">
        <span class="rs-publish-asset-visual rs-publish-asset-visual-nft" aria-hidden="true"></span>
        <span class="rs-publish-asset-name">NFT</span>
        <span class="rs-publish-asset-badge">Coming Soon</span>
      </button>
    </div>
  </div>
</div>`;
  },

  sendOverlay({ scriptDisplay, p2shAddress, amount, fee }) {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-send">
  <div class="rs-publish-workspace-inner rs-publish-send-layout">
    <div class="rs-publish-send-panels">
      <div class="rs-publish-send-panel rs-publish-send-script">
        <pre class="rs-publish-script-readonly" spellcheck="false">${scriptDisplay}</pre>
        <p class="rs-publish-panel-note">close this window to edit your script.</p>
      </div>
      <div class="rs-publish-send-panel rs-publish-send-form">
        <label class="rs-publish-field">
          <span class="rs-publish-field-label">Script Address</span>
          <input type="text" class="rs-publish-input rs-publish-address" readonly value="${p2shAddress}" spellcheck="false" />
        </label>
        <label class="rs-publish-field">
          <span class="rs-publish-field-label">Amount (SAITO)</span>
          <input type="text" class="rs-publish-input rs-publish-amount" inputmode="decimal" value="${amount}" spellcheck="false" />
        </label>
        <label class="rs-publish-field">
          <span class="rs-publish-field-label">Fee (SAITO)</span>
          <input type="text" class="rs-publish-input rs-publish-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
        </label>
        <p class="rs-publish-error" hidden></p>
        <div class="rs-publish-send-actions">
          <button type="button" class="rs-publish-go-btn" data-action="publish-broadcast">Publish</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
  },

  waitingOverlay({ phase, p2shAddress }) {
    const isSuccess = phase === 'success';
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-waiting ${isSuccess ? 'is-success' : 'is-pending'}">
  <div class="rs-publish-workspace-inner rs-publish-waiting-inner">
  ${
    isSuccess
      ? `
  <div class="rs-publish-success-icon" aria-hidden="true">✓</div>
  <h2 class="rs-publish-title">Your script is now published on the network.</h2>
  <div class="rs-publish-success-actions">
    <button type="button" class="rs-publish-success-btn rs-publish-success-primary" data-action="publish-new-script">Create New Script</button>
    <button type="button" class="rs-publish-success-btn" data-action="publish-copy-address">Copy P2SH Address</button>
    <button type="button" class="rs-publish-success-btn rs-publish-success-future" data-action="publish-spend" disabled>Spend This Script</button>
    <button type="button" class="rs-publish-success-btn rs-publish-success-future" data-action="publish-share" disabled>Share This Script</button>
  </div>
  <p class="rs-publish-address-recap" data-address="${p2shAddress}">${p2shAddress}</p>
      `
      : `
  <div class="rs-publish-spinner" aria-hidden="true">
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
  </div>
  <h2 class="rs-publish-title">Broadcasting to the network</h2>
  <p class="rs-publish-lead rs-publish-waiting-lead">Waiting for confirmation<span class="rs-publish-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
      `
  }
  </div>
</div>`;
  }
};
