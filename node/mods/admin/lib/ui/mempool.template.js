module.exports = ({ state, error, loading } = {}) => {
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

  const keys = (list) => {
    if (!list || !list.length) {
      return '—';
    }
    const first = short(list[0]);
    if (list.length === 1) {
      return first;
    }
    return `${first} +${list.length - 1}`;
  };

  const count = state ? Number(state.count) || 0 : 0;
  const shown = (state?.transactions || []).length;
  const truncated = state && count > shown;

  const rows = (state?.transactions || [])
    .map((tx) => {
      const from = (tx.from || []).join('\n');
      const to = (tx.to || []).join('\n');
      return `
        <tr class="admin-mempool-row">
          <td class="admin-mempool-sig" title="${tx.signature || ''}">${short(tx.signature)}</td>
          <td>${tx.type || '—'}</td>
          <td>${formatTime(tx.timestamp)}</td>
          <td>${tx.fees || '0'}</td>
          <td class="admin-mempool-sig" title="${from}">${keys(tx.from)}</td>
          <td class="admin-mempool-sig" title="${to}">${keys(tx.to)}</td>
        </tr>
        <tr class="admin-mempool-details" style="display:none">
          <td colspan="6">
            <div><label>Signature</label><div class="admin-mempool-sig-full">${tx.signature || '—'}</div></div>
            <div><label>From</label><div>${(tx.from || []).map((k) => `<div class="admin-mempool-sig-full">${k}</div>`).join('') || '—'}</div></div>
            <div><label>To</label><div>${(tx.to || []).map((k) => `<div class="admin-mempool-sig-full">${k}</div>`).join('') || '—'}</div></div>
            <div><label>Size</label><div>${tx.size || 0} bytes</div></div>
            <div><label>Hops</label><div>${tx.hops || 0}</div></div>
            ${
              tx.replacements
                ? `<div><label>Replacements</label><div>${tx.replacements}</div></div>`
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="admin-mempool-page">
      <div class="admin-mempool-header">
        <h1>Mempool</h1>
        <button type="button" class="admin-button" id="admin-mempool-refresh" ${
          loading ? 'disabled' : ''
        }>${loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      ${error ? `<div class="admin-mempool-error">${error}</div>` : ''}

      <div class="admin-mempool-count">
        <div class="admin-mempool-count-label">Transactions</div>
        <div class="admin-mempool-count-value">${loading && !state ? '…' : count}</div>
        ${
          truncated
            ? `<div class="admin-mempool-count-note">Showing ${shown} of ${count}</div>`
            : ''
        }
      </div>

      ${
        rows
          ? `<table class="admin-mempool-table">
              <thead>
                <tr>
                  <th>Signature</th>
                  <th>Type</th>
                  <th>Time</th>
                  <th>Fees</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
          : `<p class="admin-mempool-empty">${
              loading ? 'Loading mempool…' : 'Mempool is empty.'
            }</p>`
      }
    </div>
  `;
};
