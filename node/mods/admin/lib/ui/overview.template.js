module.exports = (app, mod) => {
  return `
    <h1 class="admin-header" id ="admin-header">${app.options?.admin?.length ? 'Logging in to Admin Dashboard' : 'Congratulations'}!</h1>

    <h3 class="server-info">Your Server Info</h3>
    <div id="node-publickey" data-publickey="${mod.publicKey}">Public Key: ${mod.server_publickey}</div>

    <div class="admin-adminkey">
    </div>

  `;
};


