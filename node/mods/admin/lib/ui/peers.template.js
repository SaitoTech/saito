module.exports = ({
  endpoint,
  public_key,
  live,
  offline,
  error,
  notice,
  loading_live
} = {}) => {
  const live_rows = (live || [])
    .map((p) => {
      const address =
        p.host && p.port
          ? `${p.protocol ? p.protocol + '://' : ''}${p.host}:${p.port}`
          : '—';
      const badge = p.permanent
        ? `<span class="admin-peer-badge">Permanent</span>`
        : '';
      const remove =
        p.permanent && p.configured_index >= 0
          ? `<button type="button" class="admin-button-quiet admin-peer-remove" data-index="${p.configured_index}">Remove</button>`
          : '';
      return `
        <tr class="admin-peer-row${p.permanent ? ' permanent' : ''}">
          <td class="admin-peer-endpoint">${address}${badge}</td>
          <td class="admin-peer-key">${p.publicKey || '—'}</td>
          <td>${p.synctype || '—'}</td>
          <td>${p.status || '—'}</td>
          <td>${remove}</td>
        </tr>
      `;
    })
    .join('');

  const offline_rows = (offline || [])
    .map((p) => {
      return `
        <div class="admin-peer-offline-row">
          <div>
            <div class="admin-peer-endpoint">${p.protocol}://${p.host}:${p.port}</div>
            <div class="admin-peer-offline-note">Not connected right now</div>
          </div>
          <button type="button" class="admin-button-quiet admin-peer-remove" data-index="${p.index}">Remove</button>
        </div>
      `;
    })
    .join('');

  const connected_permanent = (live || []).filter((p) => p.permanent);

  return `
    <div class="admin-peers-page">
      <div class="admin-peers-header">
        <h1>Peers</h1>
      </div>

      <div class="admin-peers-endpoint">
        <div class="admin-peers-endpoint-label">This server</div>
        <div class="admin-peers-endpoint-row">
          <code>${endpoint || '—'}</code>
          ${
            endpoint
              ? `<button type="button" class="admin-copy-cmd" data-cmd="${endpoint}" title="Copy to clipboard" aria-label="Copy to clipboard"><i class="fa-solid fa-copy"></i></button>`
              : ''
          }
        </div>
        <p>Other Saito operators can add this endpoint as a permanent peer.</p>
        ${
          public_key
            ? `<div class="admin-peers-key">Public key <code>${public_key}</code>
                <button type="button" class="admin-copy-cmd" data-cmd="${public_key}" title="Copy to clipboard" aria-label="Copy public key"><i class="fa-solid fa-copy"></i></button>
              </div>`
            : ''
        }
      </div>

      ${error ? `<div class="admin-peers-error">${error}</div>` : ''}
      ${notice ? `<div class="admin-peers-notice">${notice}</div>` : ''}

      <div class="admin-peers-live">
        <div class="admin-peers-section-header">
          <h2>Connected now</h2>
          <button type="button" class="admin-button-quiet" id="admin-peers-refresh" ${
            loading_live ? 'disabled' : ''
          }>${loading_live ? 'Loading…' : 'Refresh'}</button>
        </div>
        <p class="admin-peers-intro">
          These are the peers Saito is actually talking to right now.
          A green <strong>Permanent</strong> mark means this server is also configured to reconnect to that peer whenever it runs.
        </p>
        ${
          live_rows
            ? `<table class="admin-peers-table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Public key</th>
                    <th>Sync</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${live_rows}</tbody>
              </table>`
            : `<p class="admin-peers-empty">${
                loading_live ? 'Loading connected peers…' : 'No peers are connected right now.'
              }</p>`
        }
      </div>

      ${
        offline_rows
          ? `<div class="admin-peers-offline">
              <h2>Permanent peers not connected</h2>
              <p class="admin-peers-intro">These peers are in the server configuration, but they are not connected at the moment.</p>
              ${offline_rows}
            </div>`
          : ''
      }

      ${
        connected_permanent.length && !offline_rows
          ? `<p class="admin-peers-intro">All permanent peers are currently connected.</p>`
          : ''
      }

      <div class="admin-peers-add">
        <h2>Add a permanent peer</h2>
        <p class="admin-peers-intro">
          This keeps the peer in the server configuration and attempts to connect to it whenever Saito is running.
        </p>
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
  `;
};
