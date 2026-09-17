const SlipListTemplate = require('./slip-list.template');

function renderActions(tx) {
  const unlockBtn = tx.hasP2shUnlock
    ? `<button type="button" class="explorer-action explorer-tx-export-link" data-action="tx-unlock-script">Unlock Script</button>`
    : '';

  return `
      <div class="explorer-tx-footer">
        <button type="button" class="explorer-action explorer-tx-export-link" data-action="tx-export">Export Transaction</button>
        ${unlockBtn}
      </div>
    `;
}

function renderSlipSection(slips, direction, title) {
  const list = SlipListTemplate(slips || [], direction);
  return `
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">${title}</h3>
        ${list.html}
      </section>
    `;
}

module.exports = (tx) => {
  const messageSection = tx.hasTxMsg
    ? `
      <section class="explorer-tx-section explorer-txmsg-section">
        <button type="button" class="explorer-action explorer-txmsg-toggle" aria-expanded="false">
          <span class="explorer-txmsg-caret" aria-hidden="true">▶</span>
          <span class="explorer-txmsg-toggle-label">View Raw Transaction (JSON)</span>
        </button>
        <div class="explorer-txmsg-payload" hidden>
          <div class="explorer-json-view">${tx.txMsgHtml}</div>
        </div>
      </section>
    `
    : '';

  return `
    <div class="explorer-tx-row-expanded-inner">
      ${renderSlipSection(tx.fromSlips, 'From', `Inputs - ${tx.saitoIn}`)}
      ${renderSlipSection(tx.toSlips, 'To', `Outputs - ${tx.saitoOut}`)}
      ${messageSection}
      ${renderActions(tx)}
    </div>
  `;
};
