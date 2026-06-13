const { buildSendPanelOverlay } = require('./send_panel.template');

module.exports = {
  solutionOverlay({ scriptDisplay, destinationPublicKey, amount, fee }) {
    const formFieldsHtml = `
      <label class="rs-publish-field">
        <span class="rs-publish-field-label">Destination Address</span>
        <input type="text" class="rs-publish-input rs-unlock-destination" value="${destinationPublicKey}" spellcheck="false" />
      </label>
      <div class="rs-publish-field-row">
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-publish-field-label">Amount (SAITO)</span>
          <input type="text" class="rs-publish-input rs-unlock-amount" inputmode="decimal" value="${amount}" spellcheck="false" readonly />
        </label>
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-publish-field-label">Fee (SAITO)</span>
          <input type="text" class="rs-publish-input rs-unlock-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
        </label>
      </div>`;

    return buildSendPanelOverlay({
      extraRootClass: 'rs-unlock-solution',
      scriptHeading: 'Complete Script',
      scriptDisplay,
      formFieldsHtml,
      errorExtraClass: 'rs-unlock-error',
      actionButtonHtml:
        '<button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="unlock-broadcast">BROADCAST SOLUTION</button>'
    });
  },

  waitingOverlay({ destinationPublicKey }) {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-unlock-waiting is-success">
  <div class="rs-publish-workspace-inner rs-publish-waiting-inner">
  <div class="rs-publish-success-icon" aria-hidden="true">✓</div>
  <h2 class="rs-publish-title">Your script has been executed.</h2>
  <p class="rs-publish-lead rs-publish-waiting-lead">The network has processed your unlock transaction and released the locked funds.</p>
  <div class="rs-publish-success-actions">
    <button type="button" class="rs-btn rs-btn-primary rs-publish-success-btn rs-success-default" data-action="unlock-new-script">Create New Script</button>
  </div>
  <p class="rs-publish-address-recap" data-address="${destinationPublicKey}">${destinationPublicKey}</p>
  </div>
</div>`;
  }
};
