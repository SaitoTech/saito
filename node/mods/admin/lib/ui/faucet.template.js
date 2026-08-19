module.exports = ({ state, error, loading, filter = 'recent' } = {}) => {
  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const formatTime = (value) => {
    const n = Number(value);
    if (!n) {
      return '—';
    }
    return new Date(n).toLocaleString();
  };

  const short = (value) => {
    const text = String(value || '');
    if (text.length <= 20) {
      return text || '—';
    }
    return `${text.slice(0, 10)}…${text.slice(-8)}`;
  };

  const chainLabel = (row) => {
    if (row.payment_status === 'orphaned' || (row.payment_block_hash && !row.payment_longest_chain)) {
      return 'orphaned';
    }
    if (row.payment_status === 'included' && row.payment_longest_chain) {
      return row.payment_block_id ? `block ${row.payment_block_id}` : 'included';
    }
    if (row.request_block_id && row.request_longest_chain) {
      return `request block ${row.request_block_id}`;
    }
    return '—';
  };

  const counts = state?.counts || {};
  const rows = (state?.activity || [])
    .map((row) => {
      const who = row.provider_username
        ? `${escapeHtml(row.provider_username)} (${escapeHtml(row.provider || '')})`
        : escapeHtml(row.provider || '');
      return `
        <tr class="admin-faucet-row">
          <td>${formatTime(row.created_at)}</td>
          <td class="admin-faucet-sig" title="${escapeHtml(row.requester_publickey)}">${short(
            row.requester_publickey
          )}</td>
          <td>${who || '—'}</td>
          <td>${escapeHtml(row.requested_saito || '0')} SAITO</td>
          <td>${escapeHtml(row.request_status || '—')}${
            row.request_reason ? ` (${escapeHtml(row.request_reason)})` : ''
          }</td>
          <td>${escapeHtml(row.payment_status || 'none')}</td>
          <td>${escapeHtml(chainLabel(row))}</td>
        </tr>
        <tr class="admin-faucet-details" style="display:none">
          <td colspan="7">
            <div><label>Requester</label><div class="admin-faucet-sig-full">${escapeHtml(
              row.requester_publickey || '—'
            )}</div></div>
            <div><label>Provider</label><div>${escapeHtml(row.provider || '—')} ${escapeHtml(
              row.provider_user_id || ''
            )}</div></div>
            <div><label>Request tx</label><div class="admin-faucet-sig-full">${escapeHtml(
              row.request_tx_signature || '—'
            )}</div></div>
            <div><label>Payment tx</label><div class="admin-faucet-sig-full">${escapeHtml(
              row.payment_tx_signature || '—'
            )}</div></div>
            <div><label>Paid</label><div>${formatTime(row.paid_at)}</div></div>
            <div><label>Request block</label><div class="admin-faucet-sig-full">${escapeHtml(
              row.request_block_id || '—'
            )} ${escapeHtml(row.request_block_hash || '')}${
              row.request_block_hash
                ? row.request_longest_chain
                  ? ' (longest chain)'
                  : ' (not longest chain)'
                : ''
            }</div></div>
            <div><label>Payment block</label><div class="admin-faucet-sig-full">${escapeHtml(
              row.payment_block_id || '—'
            )} ${escapeHtml(row.payment_block_hash || '')}${
              row.payment_block_hash
                ? row.payment_longest_chain
                  ? ' (longest chain)'
                  : ' (not longest chain)'
                : ''
            }</div></div>
          </td>
        </tr>
      `;
    })
    .join('');

  const filterBtn = (id, label) =>
    `<button type="button" class="admin-button-quiet${
      filter === id ? ' active' : ''
    }" data-faucet-filter="${id}" ${loading ? 'disabled' : ''}>${label}</button>`;

  return `
    <div class="admin-faucet-page">
      <div class="admin-faucet-header">
        <h1>Faucet</h1>
        <button type="button" class="admin-button" id="admin-faucet-refresh" ${
          loading ? 'disabled' : ''
        }>${loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      ${error ? `<div class="admin-faucet-error">${escapeHtml(error)}</div>` : ''}

      <div class="admin-faucet-identity">
        <div>
          <label>Public key</label>
          <div class="admin-faucet-sig-full">${
            loading && !state ? '…' : escapeHtml(state?.publickey || '—')
          }</div>
        </div>
        <div>
          <label>Balance</label>
          <div class="admin-faucet-balance">${
            loading && !state
              ? '…'
              : `${escapeHtml(state?.balance_saito || '0')} SAITO`
          }</div>
          <div class="admin-faucet-nolan">${escapeHtml(state?.balance_nolan || '0')} nolan</div>
        </div>
        ${
          state?.queue_length
            ? `<div><label>Live queue</label><div>${state.queue_length}</div></div>`
            : ''
        }
      </div>

      <div class="admin-faucet-grid">
        <div class="admin-faucet-stat">
          <label>Requests</label>
          <div>${loading && !state ? '…' : counts.requests || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Last 24 hours</label>
          <div>${loading && !state ? '…' : counts.requests_recent || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Paid</label>
          <div>${loading && !state ? '…' : counts.paid || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Pending</label>
          <div>${loading && !state ? '…' : counts.pending || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Rejected</label>
          <div>${loading && !state ? '…' : counts.rejected || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Failed</label>
          <div>${loading && !state ? '…' : counts.failed || 0}</div>
        </div>
        <div class="admin-faucet-stat">
          <label>Orphaned</label>
          <div>${loading && !state ? '…' : counts.orphaned || 0}</div>
        </div>
      </div>

      <div class="admin-faucet-history">
        <div class="admin-faucet-history-header">
          <h2>Recent activity</h2>
          <div class="admin-faucet-filters">
            ${filterBtn('recent', 'Recent')}
            ${filterBtn('pending', 'Pending')}
            ${filterBtn('completed', 'Paid')}
            ${filterBtn('failed', 'Failed')}
          </div>
        </div>
        ${
          rows
            ? `<table class="admin-faucet-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Requester</th>
                    <th>Identity</th>
                    <th>Amount</th>
                    <th>Request</th>
                    <th>Payment</th>
                    <th>Chain</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
            : `<p class="admin-faucet-empty">${
                loading ? 'Loading Faucet activity…' : 'No Faucet activity recorded yet.'
              }</p>`
        }
      </div>
    </div>
  `;
};
