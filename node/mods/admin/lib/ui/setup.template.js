module.exports = (mod) => {
  return `
    <div class="admin-first-run">
      <div class="node-setup">

        <h1 class="node-setup-type-heading">I want to run a:</h1>

        <div class="node-setup-options">
          <div class="node-setup-option">
            <button type="button" class="node-setup-card" data-choice="existing">
              Existing Node
            </button>
            <p>Use this node's existing configuration without making any changes.</p>
          </div>
          <div class="node-setup-option">
            <button type="button" class="node-setup-card" data-choice="development" aria-pressed="false">
              Local Dev Node
            </button>
            <p>Your machine will produce blocks and have tokens available for testing on a local network</p>
          </div>
          <div class="node-setup-option">
            <button type="button" class="node-setup-card" data-choice="production" aria-pressed="false">
              Full/Mainnet Node
            </button>
            <p>Add your node to an existing network or Saito Mainnet</p>
          </div>
        </div>

        <div class="splash-section" hidden>
          <div class="node-setup-info">Pick the module for your server root:</div>
          <div class="splash-grid">
            <button type="button" class="splash-card" data-app="redsquare">
              <span class="splash-title">RedSquare</span>
            </button>
            <button type="button" class="splash-card" data-app="arcade">
              <span class="splash-title">Arcade</span>
            </button>
            <button type="button" class="splash-card" data-app="store">
              <span class="splash-title">Store</span>
            </button>
            <button type="button" class="splash-card" data-app="explorer">
              <span class="splash-title">Explorer</span>
            </button>
            <button type="button" class="splash-card" data-app="other">
              <span class="splash-title">Other</span>
            </button>
          </div>
        </div>

        <div class="node-setup-working" hidden role="status" aria-label="Saving node setup">
          <div class="node-setup-spinner"></div>
        </div>

        <div class="node-setup-result node-setup-dev-info" hidden>
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

        <div class="node-setup-result node-setup-prod-info" hidden>
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
