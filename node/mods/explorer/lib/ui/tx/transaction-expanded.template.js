const SlipTableTemplate = require('./slip-table.template');

module.exports = (tx) => {
	const messageSection = tx.hasTxMsg
		? `
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Message</h3>
        <div class="explorer-json-view">${tx.txMsgHtml}</div>
      </section>
    `
		: `
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Message</h3>
        <p class="explorer-tx-section-empty">No TXMSG payload for this transaction.</p>
      </section>
    `;

	return `
    <div class="explorer-tx-row-expanded-inner">
      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Metadata</h3>
        <div class="explorer-info-table-wrap explorer-info-table-compact">
          <table class="explorer-info-table">
            <tbody>
              <tr class="explorer-info-row">
                <th class="explorer-info-label" scope="row">Transaction type</th>
                <td class="explorer-info-value"><span class="explorer-tx-type-badge explorer-tx-type-badge-subtle">${tx.type}</span></td>
              </tr>
              <tr class="explorer-info-row">
                <th class="explorer-info-label" scope="row">Timestamp</th>
                <td class="explorer-info-value">${tx.timeFull}</td>
              </tr>
              <tr class="explorer-info-row">
                <th class="explorer-info-label" scope="row">Fee</th>
                <td class="explorer-info-value explorer-info-numeric">${tx.fee}</td>
              </tr>
              <tr class="explorer-info-row">
                <th class="explorer-info-label" scope="row">Index in block</th>
                <td class="explorer-info-value explorer-info-numeric">#${tx.txId}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Inputs</h3>
        ${SlipTableTemplate(tx.fromSlips || [], 'From')}
      </section>

      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Outputs</h3>
        ${SlipTableTemplate(tx.toSlips || [], 'To')}
      </section>

      ${messageSection}

      <section class="explorer-tx-section">
        <h3 class="explorer-tx-section-title">Signature</h3>
        <p class="explorer-tx-signature explorer-mono">${tx.signatureFull}</p>
      </section>
    </div>
  `;
};
