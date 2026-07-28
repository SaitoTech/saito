const { buildSendPanelOverlay } = require('./send_panel.template');

module.exports = {
  solutionOverlay({ scriptDisplay, destinationPublicKey, amount, fee }) {
    const formFieldsHtml = `
      <label class="rs-publish-field">
        <span class="rs-overlay-label rs-publish-field-label">Destination Address</span>
        <input type="text" class="saito-input rs-publish-input rs-unlock-destination" value="${destinationPublicKey}" spellcheck="false" />
      </label>
      <div class="rs-publish-field-row">
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-overlay-label rs-publish-field-label">Amount (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-unlock-amount" inputmode="decimal" value="${amount}" spellcheck="false" readonly />
        </label>
        <label class="rs-publish-field rs-publish-field-half">
          <span class="rs-overlay-label rs-publish-field-label">Fee (SAITO)</span>
          <input type="text" class="saito-input rs-publish-input rs-unlock-fee" inputmode="decimal" value="${fee}" spellcheck="false" />
        </label>
      </div>`;

    return buildSendPanelOverlay({
      extraRootClass: 'rs-unlock-solution',
      scriptDisplay,
      formFieldsHtml,
      errorExtraClass: 'rs-unlock-error',
      actionButtonHtml:
        '<button type="button" class="rs-btn rs-btn-primary rs-publish-go-btn" data-action="unlock-broadcast">BROADCAST SOLUTION</button>'
    });
  }
};
