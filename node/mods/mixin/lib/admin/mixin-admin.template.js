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
  if (transfer.status === 'treasury_submitted') {
    return 'Waiting for treasury acknowledgment';
  }
  if (transfer.status === 'treasury_accepted') {
    return 'Accepted by treasury';
  }
  if (transfer.status === 'treasury_rejected') {
    return 'Rejected by treasury';
  }
  if (transfer.purpose === 'migration' && transfer.mode === 'manual') {
    if (transfer.status === 'inbound_confirmed') {
      return 'Waiting for administrator issuance';
    }
    return 'Waiting for deposit verification';
  }
  return 'No administrative action for this status';
}

function blockingExplanation(transfer) {
  if (transfer.last_error === 'insufficient_funds') {
    return 'Blocked: not enough SAITO is available to issue this transfer.';
  }
  if (transfer.last_error) {
    return transfer.last_error;
  }
  return '';
}

function actionControl(transfer, advancing) {
  const blocked = blockingExplanation(transfer);
  if (blocked) {
    return `<span class="admin-payments-blocked">${escapeHtml(blocked)}</span>`;
  }
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
    return `<button type="button" class="admin-button admin-payments-action" data-payment-id="${escapeHtml(
      transfer.id
    )}" data-payment-action="${escapeHtml(transfer.action.action)}" ${disabled}>${escapeHtml(
      transfer.action.label
    )}</button>`;
  }
  return `<span class="admin-payments-waiting">${escapeHtml(waitingLabel(transfer))}</span>`;
}

function identifierCell(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  return `<div class="admin-payments-key" title="${escapeHtml(text)}">${escapeHtml(text)}</div>`;
}

function accountPanel(account) {
  return `
    <section class="admin-payments-section">
      <h2>Account Information</h2>
      <textarea class="admin-input admin-payments-backup" id="admin-payments-account-backup" readonly rows="8" aria-label="Account Information">${escapeHtml(
        account.backup || ''
      )}</textarea>
    </section>
  `;
}

function apiKeyPanel(apiKeyText, savingApiKey) {
  const disabled = savingApiKey ? 'disabled' : '';
  return `
    <div class="admin-payments-setup">
      <p class="admin-payments-note">In order to enable web3 payments, please provide a Mixin Access Key:</p>
      <textarea class="admin-input admin-payments-backup" id="admin-payments-api-key" rows="8" ${disabled}>${escapeHtml(
        apiKeyText || ''
      )}</textarea>
      <button type="button" class="admin-button" id="admin-payments-api-key-submit" ${disabled}>Submit</button>
    </div>
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

const OPERATION_MODE_OPTIONS = [
  { value: 'local', label: 'Local Fulfillment - Local Payouts' },
  { value: 'local_remote', label: 'Local Fulfillment - Remote Payouts' },
  { value: 'remote_remote', label: 'Remote Fulfillment - Remote Payouts' },
  { value: 'treasury', label: 'Local Fulfillment - Treasury Node' }
];

function keyListPanel({ title, description, keys, draft, kind, saving }) {
  const rows = Array.isArray(keys) ? keys : [];
  const disabled = saving ? 'disabled' : '';
  const body = rows.length
    ? `<ul class="admin-payments-key-list">
        ${rows
          .map(
            (key) => `<li class="admin-payments-key-item">
              <code class="admin-payments-key-value">${escapeHtml(key)}</code>
              <button type="button" class="admin-button-quiet" data-payments-remove-key="${escapeHtml(
                kind
              )}" data-payments-key="${escapeHtml(key)}" ${disabled}>Remove</button>
            </li>`
          )
          .join('')}
      </ul>`
    : `<p class="admin-payments-empty">No public keys configured.</p>`;

  return `<div class="admin-payments-key-panel" data-payments-key-kind="${escapeHtml(kind)}">
      <h3>${escapeHtml(title)}</h3>
      <p class="admin-payments-note">${escapeHtml(description)}</p>
      ${body}
      <div class="admin-payments-key-add">
        <input class="admin-input" id="admin-payments-${escapeHtml(
          kind
        )}-key" type="text" value="${escapeHtml(draft || '')}" placeholder="Saito public key" ${disabled} />
        <button type="button" class="admin-button" data-payments-add-key="${escapeHtml(
          kind
        )}" ${disabled}>Add</button>
      </div>
    </div>`;
}

function operationModeSection({
  operationMode = 'local',
  providerKeys = [],
  delegateKeys = [],
  providerDraft = '',
  delegateDraft = '',
  savingOperation = false,
  notice = ''
}) {
  const mode = OPERATION_MODE_OPTIONS.some((option) => option.value === operationMode)
    ? operationMode
    : 'local';
  const disabled = savingOperation ? 'disabled' : '';
  const options = OPERATION_MODE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}" ${
        option.value === mode ? 'selected' : ''
      }>${escapeHtml(option.label)}</option>`
  ).join('');

  let keys = '';
  if (mode === 'local_remote' || mode === 'remote_remote') {
    keys = keyListPanel({
      title: 'Treasury Provider Keys',
      description:
        mode === 'remote_remote'
          ? 'Add at least one Treasury node public key. This server will tunnel all requests directly to a configured provider.'
          : 'Add at least one Treasury node public key. This server will send payout requests to a configured provider.',
      keys: providerKeys,
      draft: providerDraft,
      kind: 'provider',
      saving: savingOperation
    });
  } else if (mode === 'treasury') {
    keys = keyListPanel({
      title: 'Authorized Delegate Keys',
      description: 'Approved delegates may submit payout requests to this node.',
      keys: delegateKeys,
      draft: delegateDraft,
      kind: 'delegate',
      saving: savingOperation
    });
  }

  return `<section class="admin-payments-section admin-payments-operation">
      <h2>Operation Mode</h2>
      <div class="admin-payments-operation-controls">
        <select class="admin-input" id="admin-payments-operation-mode" aria-label="Operation mode" ${disabled}>
          ${options}
        </select>
        <button type="button" class="admin-button" id="admin-payments-operation-save" ${disabled}>
          ${savingOperation ? 'Saving…' : 'Save'}
        </button>
      </div>
      ${keys}
      ${notice ? `<div class="admin-payments-notice">${escapeHtml(notice)}</div>` : ''}
    </section>`;
}

function depositSection(addresses) {
  const rows = Array.isArray(addresses) ? addresses : [];
  const body = rows.length
    ? `<div class="admin-payments-table-wrap"><table class="admin-payments-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Asset</th>
              <th>Balance</th>
              <th>Reservation</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((entry) => {
                const asset = entry.ticker || entry.asset_id || '';
                return `<tr>
              <td>${identifierCell(entry.address)}</td>
              <td>${escapeHtml(asset)}</td>
              <td>${escapeHtml(entry.balance || '0')}</td>
              <td>${entry.reservable ? 'Available' : 'Reserved'}</td>
            </tr>`;
              })
              .join('')}
          </tbody>
        </table></div>`
    : `<p class="admin-payments-empty">No deposit addresses.</p>`;
  return `<section class="admin-payments-section">
      <h2>Deposit Addresses</h2>
      ${body}
    </section>`;
}

function transferTable(rows, advancing) {
  return `<div class="admin-payments-table-wrap"><table class="admin-payments-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Purpose</th>
              <th>Owner</th>
              <th>IN</th>
              <th>OUT</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((transfer) => {
                const owner =
                  transfer.requester_publickey || transfer.recipient_publickey || transfer.publickey || '';
                const remote = transfer.inbound_sender || transfer.inbound_address || '';
                const inbound = `${transfer.inbound_amount || ''} ${transfer.inbound_ticker || ''}`.trim();
                const outbound = `${transfer.outbound_amount || ''} ${transfer.outbound_ticker || ''}`.trim();
                return `<tr>
              <td>${escapeHtml(transfer.id)}</td>
              <td>${escapeHtml(transfer.purpose || '')}</td>
              <td>${identifierCell(owner)}</td>
              <td>${escapeHtml(inbound)}${identifierCell(remote)}${identifierCell(transfer.inbound_tx_hash)}</td>
              <td>${escapeHtml(outbound)}</td>
              <td>${escapeHtml(transfer.status)}</td>
              <td>
                <div class="admin-payments-actions">
                  ${actionControl(transfer, advancing)}
                  <button type="button" class="admin-payments-trash" data-payment-id="${escapeHtml(
                    transfer.id
                  )}" data-payment-action="exclude-transfer" aria-label="Trash" title="Trash" ${
                    advancing ? 'disabled' : ''
                  }><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
              </td>
            </tr>`;
              })
              .join('')}
          </tbody>
        </table></div>`;
}

function pagination(page, total) {
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(Number(total || 0) / pageSize));
  const current = Number(page) || 1;
  return `<div class="admin-payments-pagination">
      <button type="button" class="admin-button" data-payments-page="${current - 1}" ${
        current <= 1 ? 'disabled' : ''
      }>Previous</button>
      <span>Page ${current} of ${pages} (${Number(total || 0)} transfers)</span>
      <button type="button" class="admin-button" data-payments-page="${current + 1}" ${
        current >= pages ? 'disabled' : ''
      }>Next</button>
    </div>`;
}

module.exports = ({
  transfers = [],
  account = undefined,
  error = '',
  loading = false,
  advancing = false,
  creating = false,
  restoring = false,
  restoreText = '',
  search = '',
  purpose = '',
  page = 1,
  total = 0,
  apiKeyConfigured = undefined,
  apiKeyText = '',
  savingApiKey = false,
  depositAddresses = [],
  operationMode = 'local',
  providerKeys = [],
  delegateKeys = [],
  providerDraft = '',
  delegateDraft = '',
  savingOperation = false,
  operationNotice = ''
} = {}) => {
  const rows = Array.isArray(transfers) ? transfers : [];
  const needsApiKey = !loading && apiKeyConfigured === false;
  const needsAccount = !loading && !needsApiKey && account === null;
  const body = loading
    ? `<p class="admin-payments-empty">Loading pending transfers…</p>`
    : needsApiKey
      ? apiKeyPanel(apiKeyText, savingApiKey)
      : needsAccount
      ? setupPanel(creating, restoring, restoreText)
      : `${operationModeSection({
          operationMode,
          providerKeys,
          delegateKeys,
          providerDraft,
          delegateDraft,
          savingOperation,
          notice: operationNotice
        })}
        ${depositSection(depositAddresses)}
        <section class="admin-payments-section">
          <h2>Pending Transfers</h2>
          <form id="admin-payments-search-form" class="admin-payments-search">
            <input class="admin-input" id="admin-payments-search" type="search" value="${escapeHtml(
              search
            )}" placeholder="search for transfers..." />
            <button type="submit" class="admin-button">Search</button>
            <select class="admin-input admin-payments-purpose" id="admin-payments-purpose" aria-label="Transfer type">
              <option value="" ${purpose ? '' : 'selected'}>all transfers</option>
              <option value="migration" ${purpose === 'migration' ? 'selected' : ''}>migration</option>
              <option value="buysaito" ${purpose === 'buysaito' ? 'selected' : ''}>buy saito</option>
            </select>
          </form>
          ${
            rows.length
              ? transferTable(rows, advancing)
              : `<p class="admin-payments-empty">No pending transfers.</p>`
          }
          ${pagination(page, total)}
        </section>`;

  const refreshDisabled =
    loading || advancing || creating || restoring || savingApiKey || savingOperation ? 'disabled' : '';
  return `
    <div class="admin-payments-page">
      <div class="admin-payments-header">
        <h1>Payments</h1>
        ${
          needsAccount || needsApiKey
            ? ''
            : `<button type="button" class="admin-button" id="admin-payments-refresh" ${refreshDisabled}>Refresh</button>`
        }
      </div>
      ${needsApiKey || !account?.user_id ? '' : accountPanel(account)}
      ${error ? `<div class="admin-payments-error">${escapeHtml(error)}</div>` : ''}
      ${body}
    </div>
  `;
};
