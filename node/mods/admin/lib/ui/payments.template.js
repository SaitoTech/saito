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
  if (transfer.purpose === 'migration' && transfer.mode === 'manual') {
    if (transfer.status === 'inbound_confirmed') {
      return 'Waiting for administrator issuance';
    }
    return 'Waiting for deposit verification';
  }
  return 'No test action';
}

function actionCell(transfer, advancing) {
  const disabled = advancing ? 'disabled' : '';
  if (
    transfer.purpose === 'migration' &&
    transfer.mode === 'manual' &&
    transfer.status === 'inbound_confirmed' &&
    transfer.outbound_amount &&
    !transfer.outbound_tx_sig
  ) {
    return `<button type="button" class="admin-button admin-payments-action" data-payment-id="${escapeHtml(
      transfer.id
    )}" data-payment-action="approve-migration" ${disabled}>Issue SAITO</button>`;
  }
  if (
    transfer.purpose === 'migration' &&
    transfer.mode === 'manual' &&
    (transfer.status === 'inbound_awaiting' || transfer.status === 'inbound_broadcast')
  ) {
    return `<input class="admin-input" data-migration-amount="${escapeHtml(
      transfer.id
    )}" placeholder="Verified amount" ${disabled} /><input class="admin-input" data-migration-hash="${escapeHtml(
      transfer.id
    )}" placeholder="Deposit hash" ${disabled} /><button type="button" class="admin-button admin-payments-action" data-payment-id="${escapeHtml(
      transfer.id
    )}" data-payment-action="verify-migration" ${disabled}>Verify deposit</button>`;
  }
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

function accountNote(account) {
  const name = account.full_name ? ` (${account.full_name})` : '';
  return `
    <p class="admin-payments-note">Mixin account ${escapeHtml(account.user_id)}${escapeHtml(
      name
    )} is configured on this server.</p>
    <label class="admin-payments-label" for="admin-payments-account-backup">Account backup</label>
    <textarea class="admin-input admin-payments-backup" id="admin-payments-account-backup" readonly rows="8">${escapeHtml(
      account.backup || ''
    )}</textarea>
  `;
}

function setupPanel(creating, restoring, restoreText) {
  const disabled = creating || restoring ? 'disabled' : '';
  return `
    <div class="admin-payments-setup">
      <p class="admin-payments-note">In order to setup web3 payment processing with Saito, you must create a Mixin Account for your server. This account will be used to fetch real-time price information and the status of cryptocurrency transfers on other networks:</p>
      <button type="button" class="admin-button" id="admin-payments-create-account" ${disabled}>create account</button>
      <label class="admin-payments-label" for="admin-payments-restore-account">Or restore a saved account</label>
      <textarea class="admin-input admin-payments-backup" id="admin-payments-restore-account" rows="8" ${disabled}>${escapeHtml(
        restoreText || ''
      )}</textarea>
      <button type="button" class="admin-button" id="admin-payments-restore-account-button" ${disabled}>restore account</button>
    </div>
  `;
}

module.exports = ({
  transfers = [],
  account = undefined,
  error = '',
  loading = false,
  advancing = false,
  creating = false,
  restoring = false,
  restoreText = ''
} = {}) => {
  const rows = Array.isArray(transfers) ? transfers : [];
  const needsAccount = !loading && account === null;
  const body = loading
    ? `<p class="admin-payments-empty">Loading outstanding transfers…</p>`
    : needsAccount
      ? setupPanel(creating, restoring, restoreText)
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
              <td>${escapeHtml(transfer.inbound_amount)} ${escapeHtml(transfer.inbound_ticker)}${
                transfer.inbound_tx_hash
                  ? `<div class="admin-payments-key">${escapeHtml(transfer.inbound_tx_hash)}</div>`
                  : ''
              }${
                transfer.inbound_sender
                  ? `<div class="admin-payments-key">${escapeHtml(transfer.inbound_sender)}</div>`
                  : ''
              }</td>
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

  const refreshDisabled = loading || advancing || creating || restoring ? 'disabled' : '';
  return `
    <div class="admin-payments-page">
      <div class="admin-payments-header">
        <h1>Payments</h1>
        ${
          needsAccount
            ? ''
            : `<button type="button" class="admin-button" id="admin-payments-refresh" ${refreshDisabled}>Refresh</button>`
        }
      </div>
      ${account?.user_id ? accountNote(account) : ''}
      ${
        needsAccount
          ? ''
          : `<p class="admin-payments-note">Outstanding BuySaito transfers. Detect and confirm an inbound payment here. SAITO issuance continues on the live transfer queue.</p>`
      }
      ${error ? `<div class="admin-payments-error">${escapeHtml(error)}</div>` : ''}
      ${body}
    </div>
  `;
};
