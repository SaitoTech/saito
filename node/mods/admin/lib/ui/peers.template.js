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
    <tr>
      <td>${escapeHtml(peer.host || '—')}</td>
      <td>${escapeHtml(peer.port || '—')}</td>
      <td class="admin-peer-key">${escapeHtml(peer.publicKey || '—')}</td>
      <td>${peer.verified ? 'Yes' : 'No'}</td>
      <td>
        <select class="admin-input admin-peer-type" data-peer-type data-peer-key="${escapeHtml(
          peer.key
        )}" ${disabled}>
          <option value="saved" ${peer.saved ? 'selected' : ''}>SAVED</option>
          <option value="na" ${peer.saved ? '' : 'selected'}>N/A</option>
        </select>
      </td>
    </tr>
  `;
}

module.exports = ({ url, host, port, peers, error, notice, loading_live } = {}) => {
  const rows = peers || [];
  const body = rows.length
    ? `<table class="admin-peers-table">
        <thead>
          <tr>
            <th>Host</th>
            <th>Port</th>
            <th>Public key</th>
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
        <h1>Network</h1>
      </div>

      <div class="admin-peers-server">
        <h2>Your Server</h2>
        <p class="admin-peers-intro">
          Your server is running at the following address. Change the information below to update it.
        </p>
        <div class="admin-peers-server-form">
          <label for="admin-server-url">URL</label>
          <input class="admin-input" id="admin-server-url" value="${escapeHtml(url || '')}" readonly />
          <label for="admin-server-host">Host</label>
          <input class="admin-input" id="admin-server-host" value="${escapeHtml(host || '')}" readonly />
          <label for="admin-server-port">Port</label>
          <input class="admin-input" id="admin-server-port" value="${escapeHtml(port || '')}" readonly />
          <button type="button" class="admin-button" id="admin-server-update" disabled>Update</button>
        </div>
      </div>

      ${error ? `<div class="admin-peers-error">${error}</div>` : ''}
      ${notice ? `<div class="admin-peers-notice">${notice}</div>` : ''}

      <div class="admin-peers-live">
        <div class="admin-peers-section-header">
          <h2>Peers</h2>
          <button type="button" class="admin-button-quiet" id="admin-peers-refresh" ${
            loading_live ? 'disabled' : ''
          }>${loading_live ? 'Loading…' : 'Refresh'}</button>
        </div>
        ${body}
        <div class="admin-peers-add">
          <h2>Add a peer</h2>
          <div class="admin-peers-form">
            <input class="admin-input" id="admin-peer-host" placeholder="host or https://host:port" />
            <input class="admin-input" id="admin-peer-port" type="number" placeholder="port" />
            <select class="admin-input" id="admin-peer-protocol">
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
            <button type="button" class="admin-button" id="admin-peer-add">Add peer</button>
          </div>
        </div>
      </div>
    </div>
  `;
};
