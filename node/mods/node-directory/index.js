module.exports = (app, mod) => {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Saito Node Directory</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/${encodeURI(mod.returnSlug())}/css/main.css" />
  </head>
  <body>
    <div id="node-directory-app">
      <header class="nd-header">
        <h1>Saito Node Directory</h1>
        <p class="nd-subtitle">
          Live view of peers, advertised services, and nearest-node RTT.
        </p>
      </header>

      <main class="nd-main">
        <section class="nd-controls">
          <label>
            Service:
            <select id="nd-app-slug">
              <option value="">Select a service...</option>
            </select>
          </label>
          <button id="nd-refresh-all">Refresh All Nodes</button>
          <button id="nd-find-best">Find Best Node for Service</button>
        </section>

        <section class="nd-summary" id="nd-summary"></section>

        <section class="nd-table-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h2 style="margin: 0;">Known Peers</h2>
            <span id="nd-data-age" class="nd-data-age">Loading...</span>
          </div>
          <table class="nd-table">
            <thead>
              <tr>
                <th>Hostname / Public Key</th>
                <th>Status</th>
                <th>Type</th>
                <th>Services</th>
                <th>Last RTT (ms)</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody id="nd-peer-rows">
              <tr>
                <td colspan="6" class="nd-empty">Loading peers…</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <footer class="nd-footer">
        <small>
          Nodes come from <code>app.network.getPeers()</code> (direct peers) and network discovery
          (querying connected peers for their peer lists). Services come from <code>PeerService</code>
          advertisements. RTT is measured server-side using <code>NodeDirectory</code>.
        </small>
      </footer>
    </div>

    <script src="/saito/saito.js"></script>
    <script src="/${encodeURI(mod.returnSlug())}/js/main.js"></script>
  </body>
</html>
`;
};

