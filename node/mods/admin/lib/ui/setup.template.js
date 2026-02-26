module.exports = (mod) => {

  const options = mod?.server_info?.options || {};
  const home_app = options.defaultModule || "";

  let splash_apps = [
    { id: "redsquare", label: "RedSquare" },
    { id: "arcade", label: "Arcade" },
    { id: "store", label: "Store" },
    { id: "other", label: "Other" }
  ];

  let splash_html = splash_apps.map(app => {
    let selected = home_app === app.id ? "selected" : "";
    return `
      <div class="splash-card ${selected}" data-app="${app.id}">
        <div class="splash-title">${app.label}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="node-setup">

      <div class="node-setup-info">1. Pick the module for your server root:</div>
 
      <div class="splash-section">
        <div class="splash-grid">
          ${splash_html}
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

      <div class="node-setup-working" style="display:none;">
        <div class="node-setup-spinner"></div>
      </div>

      <div class="node-setup-dev-info" style="display:none;">

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

    </div>
  `;
};

