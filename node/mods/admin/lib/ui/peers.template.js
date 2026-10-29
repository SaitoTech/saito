function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function peerRow(peer, loading) {
  const disabled = loading ? 'disabled' : '';
  return `
    <tr class="admin-peer-row" data-peer-key="${escapeHtml(peer.key)}" tabindex="0">
      <td class="admin-peer-key">${escapeHtml(peer.publicKey || '—')}</td>
      <td>${escapeHtml(peer.host || '—')}</td>
      <td>${escapeHtml(peer.port || '—')}</td>
      <td>${peer.verified ? 'Yes' : 'No'}</td>
      <td class="admin-peer-type-cell">
        <select class="admin-input admin-peer-type" data-peer-type data-peer-key="${escapeHtml(
          peer.key
        )}" ${disabled}>
          <option value="saved" ${peer.saved ? 'selected' : ''}>Saved</option>
          <option value="na" ${peer.saved ? '' : 'selected'}>N/A</option>
        </select>
      </td>
    </tr>
  `;
}

function detailRows(detail = {}) {
  const fields = [
    ['Public Key', detail.publicKey],
    ['Host', detail.host],
    ['Port', detail.port],
    ['Protocol', detail.protocol],
    ['Sync type', detail.synctype],
    ['Status', detail.status],
    ['Peer id', detail.id],
    ['Type', detail.saved ? 'Saved' : 'N/A']
  ];

  return fields
    .map(
      ([label, value]) => `
      <div class="admin-peer-detail-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value === '' || value == null ? '—' : String(value))}</dd>
      </div>`
    )
    .join('');
}

module.exports = ({
  protocol,
  host,
  port,
  peers,
  error,
  notice,
  loading_live,
  show_add_form,
  detail
} = {}) => {
  const rows = peers || [];
  const proto = protocol === 'https' ? 'https' : 'http';
  const body = rows.length
    ? `<table class="admin-peers-table">
        <thead>
          <tr>
            <th>Public Key</th>
            <th>Host</th>
            <th>Port</th>
            <th>Verified</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>${rows.map((peer) => peerRow(peer, loading_live)).join('')}</tbody>
      </table>`
    : `<p class="admin-peers-empty">${
        loading_live ? 'Loading peers…' : 'No peers are saved or connected right now.'
      }</p>`;

  return `
    <div class="admin-peers-page">
      <div class="admin-peers-header">
        <h1>Your Server</h1>
      </div>

      <div class="admin-peers-server">
        <div class="admin-peers-server-form">
          <div class="admin-peers-field">
            <label for="admin-server-protocol">Protocol</label>
            <select class="admin-input" id="admin-server-protocol">
              <option value="http" ${proto === 'http' ? 'selected' : ''}>HTTP</option>
              <option value="https" ${proto === 'https' ? 'selected' : ''}>HTTPS</option>
            </select>
          </div>
          <div class="admin-peers-field admin-peers-field-host">
            <label for="admin-server-host">Host</label>
            <input class="admin-input" id="admin-server-host" value="${escapeHtml(host || '')}" />
          </div>
          <div class="admin-peers-field admin-peers-field-port">
            <label for="admin-server-port">Port</label>
            <input class="admin-input admin-server-port" id="admin-server-port" value="${escapeHtml(
              port || ''
            )}" />
          </div>
          <div class="admin-peers-field admin-peers-field-action">
            <span class="admin-peers-field-spacer" aria-hidden="true"></span>
            <button type="button" class="admin-button" id="admin-server-update">Update</button>
          </div>
        </div>
      </div>

      ${error ? `<div class="admin-peers-error">${escapeHtml(error)}</div>` : ''}
      ${notice ? `<div class="admin-peers-notice">${escapeHtml(notice)}</div>` : ''}

      <div class="admin-peers-live">
        <div class="admin-peers-section-header">
          <div class="admin-peers-heading">
            <h2>Peers</h2>
            <button type="button" class="admin-button-icon" id="admin-peers-refresh"
              ${loading_live ? 'disabled' : ''}
              title="Refresh peers" aria-label="Refresh peers">
              <i class="fa-solid fa-rotate${loading_live ? ' fa-spin' : ''}" aria-hidden="true"></i>
            </button>
          </div>
          <button type="button" class="admin-button" id="admin-peer-add-toggle">
            ${show_add_form ? 'Cancel' : 'Add Peer'}
          </button>
        </div>

        <div class="admin-peers-add" ${show_add_form ? '' : 'hidden'}>
          <div class="admin-peers-form">
            <input class="admin-input" id="admin-peer-host" placeholder="host or https://host:port" />
            <input class="admin-input admin-peer-port" id="admin-peer-port" type="number" placeholder="port" />
            <select class="admin-input" id="admin-peer-protocol">
              <option value="https">HTTPS</option>
              <option value="http">HTTP</option>
            </select>
            <button type="button" class="admin-button" id="admin-peer-add">Add peer</button>
          </div>
        </div>

        ${body}
      </div>

      ${
        detail
          ? `<div class="admin-peer-detail-backdrop" id="admin-peer-detail-close" role="presentation">
              <div class="admin-peer-detail" role="dialog" aria-modal="true" aria-label="Peer details">
                <div class="admin-peer-detail-header">
                  <h2>Peer details</h2>
                  <button type="button" class="admin-button-quiet" id="admin-peer-detail-dismiss">Close</button>
                </div>
                <dl class="admin-peer-detail-list">${detailRows(detail)}</dl>
              </div>
            </div>`
          : ''
      }
    </div>
  `;
};
