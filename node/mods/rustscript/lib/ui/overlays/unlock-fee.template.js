const { buildRustscriptOverlay } = require('./overlay.shell');

module.exports = {
  feeOverlay({ defaultFee = '' } = {}) {
    return buildRustscriptOverlay({
      className: 'rs-overlay-prompt rs-unlock-fee-overlay',
      title: 'Transaction Fee',
      titleClass: 'rs-spend-title',
      bodyHtml: `
        <p class="rs-overlay-lead rs-unlock-fee-lead">
          Specify the network fee for this transaction.
        </p>
        <label class="rs-spend-field">
          <span class="rs-overlay-label">Fee</span>
          <input
            type="text"
            class="saito-input rs-publish-input rs-unlock-fee-amount"
            inputmode="decimal"
            value="${defaultFee}"
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <p class="rs-unlock-fee-note">
          Once set, this fee is locked. Wallet funding is applied automatically when you sign — it is not shown in the unlock panel.
        </p>
        <p class="rs-prompt-validation rs-unlock-fee-error" hidden role="alert"></p>
      `,
      actionsHtml: `<button type="button" class="rs-btn rs-btn-primary" data-action="set-unlock-fee">Set Transaction Fee</button>`,
      actionsClass: 'rs-overlay-actions-end'
    });
  }
};
