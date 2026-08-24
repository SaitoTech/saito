module.exports = (mod) => {
  return `
    <div class="admin-first-run">
      <div class="node-setup">

        <h1>Configure Your Saito Server</h1>

        <div class="node-setup-options node-setup-existing-option">
          <div class="node-setup-card" data-choice="existing">
            <h2>Existing Node</h2>
            <p>Use this node's existing configuration without making any changes.</p>
          </div>
        </div>

        <div class="node-setup-info">Or configure a new node:</div>

        <div class="node-setup-info">1. Pick the module for your server root:</div>

        <div class="splash-section">
          <div class="splash-grid">
            <div class="splash-card" data-app="redsquare">
              <div class="splash-title">RedSquare</div>
            </div>
            <div class="splash-card" data-app="arcade">
              <div class="splash-title">Arcade</div>
            </div>
            <div class="splash-card" data-app="store">
              <div class="splash-title">Store</div>
            </div>
            <div class="splash-card" data-app="explorer">
              <div class="splash-title">Explorer</div>
            </div>
            <div class="splash-card" data-app="other">
              <div class="splash-title">Other</div>
            </div>
          </div>
        </div>

        <div class="node-setup-info">2. Pick the type of server you wish to operate:</div>

        <div class="node-setup-options">
          <div class="node-setup-card" data-choice="production">
            <h2>I want to run a production machine</h2>
          </div>
          <div class="node-setup-card" data-choice="development">
            <h2>I want to run a local dev machine</h2>
          </div>
        </div>

        <div class="node-setup-explainer">
          <p>
            For local development, your machine will be customized to produce
            blocks on demand and you will be provided with the private key needed
            to spend or move funds around the network.
            For production machines, we will configure your node to join the
            network.
          </p>
        </div>

        <div class="node-setup-working">
          <div class="node-setup-spinner"></div>
        </div>

        <div class="node-setup-result node-setup-dev-info">
          Your configuration files have been updated for local development.

          <p></p>

          Please shutdown your server and run the following command:

          <p></p>

          <span class="admin-cmd-line">
            <b>npm run setuplocal</b>
            <button type="button" class="admin-copy-cmd" data-cmd="npm run setuplocal" title="Copy to clipboard" aria-label="Copy to clipboard"><i class="fa-solid fa-copy"></i></button>
          </span>

          <p></p>

          This will recompile your Saito install for local development with pre-allocated
          Saito that you can use for development. Once your server restarts, you can connect
          here to continue with module setup and configuration.
        </div>

        <div class="node-setup-result node-setup-prod-info">
          Your server is configured to connect to the network.

          <p></p>

          Please run the following command:

          <p></p>

          <span class="admin-cmd-line">
            <b>npm run setupprod</b>
            <button type="button" class="admin-copy-cmd" data-cmd="npm run setupprod" title="Copy to clipboard" aria-label="Copy to clipboard"><i class="fa-solid fa-copy"></i></button>
          </span>

          <p></p>

          After restarting, return here to configure your modules / setup.
        </div>

      </div>

      <div class="admin-wiki">For manual setup instructions, please see our install instructions in the <a target="_blank" href="https://wiki.saito.io">Saito Wiki</a>.</div>
    </div>
  `;
};
