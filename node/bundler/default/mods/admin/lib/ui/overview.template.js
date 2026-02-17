module.exports = (app, mod) => {
  let html = `
    <h1 class="admin-header" id ="admin-header">${app.options?.admin?.length ? 'Logging in to Admin Dashboard' : 'Congratulations'}!</h1>
  `;

  if (!need_to_set_key) {
    html += `

    <div class="admin-server">
      <div class="admin-server-header">
        <h3>Your Server</h3>
      </div>

      <div class="admin-server-grid">
        <div class="server-stat">
          <label>Public Key</label>
          <div
            id="node-publickey"
            class="mono"
            data-publickey="${mod.server_publickey}"
          >${mod.server_publickey}</div>
        </div>

        <div class="server-stat">
          <label>Balance</label>
          <div id="node-balance"> -- </div>
        </div>

        <div class="server-stat">
          <label>Host</label>
          <div id="node-host">localhost</div>
        </div>

        <div class="server-stat">
          <label>Port</label>
          <div id="node-port">12101</div>
        </div>
      </div>
    </div>
    `;
  }

  html += `

    <div class="admin-adminkey"></div>
    <div class="admin-setup"></div>
    <div class="admin-dashbox"></div>

  `;

  return html;
};


