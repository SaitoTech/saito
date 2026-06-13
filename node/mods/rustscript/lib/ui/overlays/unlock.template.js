module.exports = {
  solutionOverlay({ scriptDisplay, destinationPublicKey, amount, fee }) {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-unlock-solution">
  <div class="rs-publish-send-panels">
    <div class="rs-publish-send-column rs-publish-send-script">
      <h3 class="rs-unlock-panel-heading">Complete Script</h3>
      <pre class="rs-publish-script-readonly" spellcheck="false">${scriptDisplay}</pre>
      <p class="rs-publish-panel-note">Locking script and witness data required to unlock these funds.</p>
    </div>
    <div class="rs-publish-send-column rs-publish-send-form">
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Destination Address</span>
        <input type="text" class="rs-publish-input rs-unlock-destination" value="${destinationPublicKey}" spellcheck="false" />
      </label>
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Amount (SAITO)</span>
        <input type="text" class="rs-publish-input rs-unlock-amount" inputmode="decimal" value="${amount}" spellcheck="false" readonly />
      </label>
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Fee (SAITO)</span>
        <input type="text" class="rs-publish-input rs-unlock-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
      </label>
      <p class="rs-publish-error rs-unlock-error" hidden></p>
      <div class="rs-publish-send-actions">
        <button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="unlock-broadcast">BROADCAST SOLUTION</button>
      </div>
    </div>
  </div>
</div>`;
  },

  waitingOverlay({ phase, destinationPublicKey }) {
    const isSuccess = phase === 'success';
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-unlock-waiting ${isSuccess ? 'is-success' : 'is-pending'}">
  <div class="rs-publish-workspace-inner rs-publish-waiting-inner">
  ${
    isSuccess
      ? `
  <div class="rs-publish-success-icon" aria-hidden="true">✓</div>
  <h2 class="rs-publish-title">Your script has been executed.</h2>
  <p class="rs-publish-lead rs-publish-waiting-lead">The network has processed your unlock transaction and released the locked funds.</p>
  <div class="rs-publish-success-actions">
    <button type="button" class="rs-btn rs-btn-primary rs-publish-success-btn rs-success-default" data-action="unlock-new-script">Create New Script</button>
  </div>
  <p class="rs-publish-address-recap" data-address="${destinationPublicKey}">${destinationPublicKey}</p>
      `
      : `
  <div class="rs-publish-spinner" aria-hidden="true">
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
    <span class="rs-publish-spinner-box"></span>
  </div>
  <h2 class="rs-publish-title">Your solution has been broadcast to the network.</h2>
  <p class="rs-publish-lead rs-publish-waiting-lead">Waiting for confirmation<span class="rs-publish-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
      `
  }
  </div>
</div>`;
  }
};
