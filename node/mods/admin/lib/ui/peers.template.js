
module.exports = (mod) => {

  const options = mod?.server_info?.options || {};
  const peers = options.peers || [];

  const endpoint =
    options.endpoint || {
      host: options.host,
      port: options.port,
      protocol: options.protocol
    };

  let peers_html = peers.map((peer, i) => {
    const url = `${peer.protocol}://${peer.host}:${peer.port}`;
    return `
      <div class="peer-row" data-index="${i}">
        <div class="peer-main">
          <strong>${url}</strong>
          ${peer.publicKey ? `<div class="peer-key">${peer.publicKey}</div>` : ""}
        </div>
        <button class="peer-remove">Remove</button>
      </div>
    `;
  }).join("");

  return `
    <div class="admin-peers">

      <h1>Network Peers</h1>

      <div class="server-info">
        <h2>This Server</h2>
        <div class="server-endpoint">
          <code>${endpoint.protocol}://${endpoint.host}:${endpoint.port}</code>
        </div>
        <p class="hint">
          Share this information with other node operators so they can add you as a peer.
        </p>
      </div>

      <div class="peers-section">
        <h2>Configured Peers</h2>
        <div class="peers-list">
          ${peers_html || "<p class='hint'>No peers configured.</p>"}
        </div>
      </div>

      <div class="add-peer">
        <h2>Add Peer</h2>
        <div class="peer-form">
          <input id="peer-host" placeholder="host (e.g. saito.io)" />
          <input id="peer-port" placeholder="port" type="number" />
          <select id="peer-protocol">
            <option value="https">https</option>
            <option value="http">http</option>
          </select>
          <input id="peer-key" placeholder="public key (optional)" />
          <button id="add-peer-btn">Add Peer</button>
        </div>
      </div>

      <div class="peer-actions">
        <button id="save-peers" disabled>Save Changes</button>
      </div>

    </div>
  `;
};

