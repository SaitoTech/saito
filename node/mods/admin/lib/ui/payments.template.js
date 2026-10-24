function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function waitingLabel(transfer) {
  if (transfer.status === 'inbound_broadcast') {
    return 'Waiting for provider confirmation';
  }
  if (transfer.status === 'inbound_confirmed') {
    return 'Waiting for SAITO issuance';
  }
  if (transfer.status === 'outbound_awaiting') {
    return 'Waiting for issuance broadcast';
  }
  if (transfer.status === 'outbound_broadcast') {
    return 'Waiting for chain inclusion';
  }
  return 'No test action';
}

function actionCell(transfer, advancing) {
  if (transfer.action?.action && transfer.action?.label) {
    const disabled = advancing ? 'disabled' : '';
    return `<button type="button" class="admin-button admin-payments-action" data-payment-id="${escapeHtml(
      transfer.id
    )}" data-payment-action="${escapeHtml(transfer.action.action)}" ${disabled}>${escapeHtml(
      transfer.action.label
    )}</button>`;
  }
  return `<span class="admin-payments-waiting">${escapeHtml(waitingLabel(transfer))}</span>`;
}

module.exports = ({ transfers = [], error = '', loading = false, advancing = false } = {}) => {
  const rows = Array.isArray(transfers) ? transfers : [];
  const body = loading
    ? `<p class="admin-payments-empty">Loading outstanding transfers…</p>`
    : rows.length
      ? `<table class="admin-payments-table">
          <thead>
            <tr>
              <th>Transfer</th>
              <th>Requester</th>
              <th>Recipient</th>
              <th>Sending</th>
              <th>Expected SAITO</th>
              <th>Status</th>
              <th>Error</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (transfer) => `<tr>
              <td>${escapeHtml(transfer.id)}</td>
              <td class="admin-payments-key" title="${escapeHtml(transfer.requester_publickey)}">${escapeHtml(
                transfer.requester_publickey
              )}</td>
              <td class="admin-payments-key" title="${escapeHtml(transfer.recipient_publickey)}">${escapeHtml(
                transfer.recipient_publickey
              )}</td>
              <td>${escapeHtml(transfer.inbound_amount)} ${escapeHtml(transfer.inbound_ticker)}</td>
              <td>${escapeHtml(transfer.outbound_amount)} ${escapeHtml(transfer.outbound_ticker || 'SAITO')}</td>
              <td>${escapeHtml(transfer.status)}</td>
              <td>${escapeHtml(transfer.last_error || '')}</td>
              <td>${actionCell(transfer, advancing)}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : `<p class="admin-payments-empty">No outstanding BuySaito transfers.</p>`;

  return `
    <div class="admin-payments-page">
      <div class="admin-payments-header">
        <h1>Payments</h1>
        <button type="button" class="admin-button" id="admin-payments-refresh" ${
          loading || advancing ? 'disabled' : ''
        }>Refresh</button>
      </div>
      <p class="admin-payments-note">Outstanding BuySaito transfers. Detect and confirm an inbound payment here. SAITO issuance continues on the live transfer queue.</p>
      ${error ? `<div class="admin-payments-error">${escapeHtml(error)}</div>` : ''}
      ${body}
    </div>
  `;
};
