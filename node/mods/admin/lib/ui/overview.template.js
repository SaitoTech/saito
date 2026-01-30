module.exports = (app, mod) => {
  return `
    <h1 class="admin-header" id ="admin-header">${app.options?.admin?.length ? 'Logging in to Admin Dashboard' : 'Congratulations'}!</h1>

    <div class="admin-server">
      <h3 class="server-info">Your Server Info</h3>
      <div id="node-publickey" data-publickey="${mod.publicKey}">Public Key: ${mod.server_publickey}</div>
    </div>

    <div class="admin-adminkey"></div>
    <div class="admin-setup"></div>
    <div class="admin-dashbox"></div>

  `;
};


