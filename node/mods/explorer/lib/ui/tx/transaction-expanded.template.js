const SlipTableTemplate = require('./slip-table.template');

function renderActions(tx) {
  const unlockBtn = tx.hasP2shUnlock
    ? `<button type="button" class="explorer-action explorer-tx-action-btn" data-action="tx-unlock-script">Unlock Script</button>`
    : '';

  return `
      <section class="explorer-tx-section explorer-tx-actions-section">
        <h3 class="explorer-tx-section-title">Actions</h3>
        <div class="explorer-action-row">
          <button type="button" class="explorer-action explorer-tx-action-btn" data-action="tx-export">Export Transaction</button>
          ${unlockBtn}
        </div>
      </section>
    `;
}

module.exports = (tx) => {
  const fromTable = SlipTableTemplate(tx.fromSlips || [], 'From');
  const toTable = SlipTableTemplate(tx.toSlips || [], 'To');

  const inputsSection = fromTable.hasSlips
    ? `
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Inputs</h3>
        ${fromTable.html}
      </section>
    `
    : fromTable.html;

  const outputsSection = toTable.hasSlips
    ? `
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Outputs</h3>
        ${toTable.html}
      </section>
    `
    : toTable.html;

  const messageSection = tx.hasTxMsg
    ? `
      <section class="explorer-tx-section explorer-txmsg-section">
        <button type="button" class="explorer-action explorer-txmsg-toggle" aria-expanded="false">
          <span class="explorer-txmsg-caret" aria-hidden="true">▶</span>
          <span class="explorer-txmsg-toggle-label">View transaction payload</span>
        </button>
        <div class="explorer-txmsg-payload" hidden>
          <div class="explorer-json-view">${tx.txMsgHtml}</div>
        </div>
      </section>
    `
    : `<p class="explorer-tx-empty-line">There is no TXMSG payload in this transaction.</p>`;

  return `
    <div class="explorer-tx-row-expanded-inner">
      <dl class="explorer-tx-meta">
        <dt class="explorer-tx-meta-label">Signature</dt>
        <dd class="explorer-tx-meta-value explorer-tx-meta-value-mono">${tx.signatureFull}</dd>
        <dt class="explorer-tx-meta-label">Timestamp</dt>
        <dd class="explorer-tx-meta-value">${tx.timeDetail}</dd>
        <dt class="explorer-tx-meta-label">Fee</dt>
        <dd class="explorer-tx-meta-value">${tx.fee}</dd>
      </dl>

      ${inputsSection}
      ${outputsSection}
      ${messageSection}
      ${renderActions(tx)}
    </div>
  `;
};
