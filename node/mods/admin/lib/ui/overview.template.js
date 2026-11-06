function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function homeModuleOptions(mod, selected) {
  const available = new Set(mod?.server_info?.available_modules || []);
  const metadata = mod?.server_info?.module_metadata || {};
  // Same home choices as node setup, plus Website when the module is available.
  const preferred = ['website', 'redsquare', 'arcade', 'store', 'explorer', 'other'];
  const names = preferred.filter(
    (name) => name === 'other' || available.size === 0 || available.has(name)
  );

  if (selected && !names.includes(selected)) {
    names.unshift(selected);
  }

  return names.map((name) => {
    const label = metadata[name]?.title || name.charAt(0).toUpperCase() + name.slice(1);
    return `<option value="${escapeHtml(name)}" ${
      name === selected ? 'selected' : ''
    }>${escapeHtml(label)}</option>`;
  });
}

module.exports = (app, mod, ui = {}) => {
  const options = mod?.server_info?.options || {};
  const balance = ui.balance || '—';
  const selected_home = options.defaultModule || '';
  const public_key = mod.server_publickey || '—';

  return `
    <h1 class="admin-header">Welcome back, Saito Admin</h1>

    <div class="admin-server">
      <div class="admin-server-fields">
        <div class="server-stat server-stat-wide">
          <label>Server Public Key</label>
          <div>
            <div class="admin-server-key">
              <span class="mono" title="${escapeHtml(public_key)}">${escapeHtml(public_key)}</span>
              <button type="button" class="admin-copy-cmd" id="admin-copy-server-key"
                title="Copy public key" aria-label="Copy server public key" ${mod.server_publickey ? '' : 'disabled'}>
                <i class="fa-solid fa-copy" aria-hidden="true"></i>
              </button>
            </div>
            <span class="admin-key-copy-status" aria-live="polite"></span>
          </div>
        </div>

        <div class="server-stat">
          <label>Server Balance</label>
          <div class="admin-server-balance">${escapeHtml(balance)}</div>
        </div>

        <div class="server-stat server-stat-wide">
          <label for="admin-server-home">Home</label>
          <select class="admin-input" id="admin-server-home">
            ${homeModuleOptions(mod, selected_home).join('')}
          </select>
        </div>
      </div>
    </div>

    <section class="admin-network" aria-label="Connected network">
      <div class="admin-network-controls">
        <div class="admin-network-heading">
          <h2>Connected network</h2>
          <button type="button" class="admin-button">Refresh</button>
        </div>
        <p class="admin-network-legend">⇄ Full node · two lines &nbsp; — Browser · one line</p>
        <p role="status">Loading connected nodes…</p>
        <p class="admin-network-fallback" hidden>WebGL is unavailable. Node labels are shown below.</p>
      </div>
      <div class="admin-network-viewport" tabindex="0" aria-label="Network diagram. Scroll to explore all nodes.">
        <div class="admin-network-size"><div class="admin-network-stage"></div></div>
      </div>
    </section>

    <p class="admin-overview-blurb">
      This is the Saito Admin module, where you can configure your server and setup applications.
    </p>
  `;
};
