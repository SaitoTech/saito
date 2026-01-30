module.exports = (mod) => {

  const options = mod?.server_info?.options || {};
  const block_production_enabled =
    options.consensus?.disable_block_production === false;
  const home_app = options.home_app || "";

  const splash_apps = [
    { id: "redsquare", label: "RedSquare" },
    { id: "arcade", label: "Arcade" },
    { id: "store", label: "Store" },
    { id: "other", label: "Other" }
  ];

  let splash_html = splash_apps.map(app => {
    const selected = home_app === app.id ? "selected" : "";
    return `
      <div class="splash-card ${selected}" data-app="${app.id}">
        <div class="splash-title">${app.label}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="admin-dashboard">

      <div class="dashboard-intro">
        <p>
          Welcome back to the Admin Dashboard. Your admin key is now registered with your server.
	  On this page you can now enable/disable block production and select the application 
	  that you want to display by default.
        </p>
      </div>

      <div class="dashboard-section">
        <h2>Active</h2>
  <button
    id="block-production-btn"
    class="${block_production_enabled ? "enabled" : "disabled"}"
  >
    ${block_production_enabled
      ? "Disable Block Production"
      : "Enable Block Production"}
  </button>
      </div>

      <div class="dashboard-section">
        <h2>Applications</h2>
        p>
          Choose which application loads at the root (<code>/</code>) of your server.
          You can change this later as you install new apps.
        </p>
        <div class="splash-grid">
          ${splash_html}
        </div>
      </div>

      <div class="dashboard-note" id="dashboard-note">
      </div>

    </div>
  `;
};

