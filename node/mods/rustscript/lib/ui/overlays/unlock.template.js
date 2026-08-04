const { buildRustscriptOverlay } = require('./overlay.shell');
const { escapeHtml } = require('../unlock_tx_edit');

module.exports = {
  /**
   * Confirm-and-broadcast overlay. Fee amount is locked; funding is on unlock_transaction_final.
   */
  solutionOverlay({ feeDisplay = '', outputSummary = '' } = {}) {
    return buildRustscriptOverlay({
      className: 'rs-overlay-prompt rs-unlock-solution',
      title: 'Broadcast Unlock Transaction',
      titleClass: 'rs-spend-title',
      bodyHtml: `
        <p class="rs-overlay-lead">
          Your unlock transaction is complete. Broadcast it to the Saito network.
        </p>
        <dl class="rs-unlock-confirm-meta">
          <div class="rs-unlock-confirm-row">
            <dt>Network fee</dt>
            <dd>${escapeHtml(feeDisplay || '—')}</dd>
          </div>
          <div class="rs-unlock-confirm-row">
            <dt>Outputs</dt>
            <dd>${escapeHtml(outputSummary || 'Ready')}</dd>
          </div>
        </dl>
        <p class="rs-prompt-validation rs-unlock-error" hidden role="alert"></p>
      `,
      actionsHtml: `<button type="button" class="rs-btn rs-btn-primary" data-action="unlock-broadcast">Broadcast Unlock Transaction</button>`,
      actionsClass: 'rs-overlay-actions-end'
    });
  }
};
