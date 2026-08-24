const MODE_LABELS = {
  off: 'Off',
  both: 'Both',
  server: 'Server',
  client: 'Client'
};

module.exports = (modules, { dirty, saved, error, filter } = {}) => {
  const present = (modules || []).filter((m) => !m.missing);
  const missing = (modules || []).filter((m) => m.missing);

  const card = (m) => {
    const missing_class = m.missing ? ' missing' : '';
    const title =
      m.name === 'admin'
        ? 'Admin stays available so you can keep using this page'
        : 'Click to change';
    return `
      <button type="button" class="admin-module-card mode-${m.mode}${missing_class}" data-module="${m.name}" title="${title}">
        <span class="admin-module-name">${m.name}</span>
        <span class="admin-module-mode">${MODE_LABELS[m.mode] || m.mode}</span>
      </button>
    `;
  };

  return `
    <div class="admin-modules-page">
      <div class="admin-modules-header">
        <h1>Modules</h1>
        <button id="admin-modules-save" class="admin-button" ${dirty ? '' : 'disabled'}>Save</button>
      </div>

      <p class="admin-modules-intro">
        Click a module to change how it runs on this server.
        <strong>Off</strong> leaves it unused.
        <strong>Both</strong> runs it on this server and includes it for browsers.
        <strong>Server</strong> is this machine only.
        <strong>Client</strong> is browsers only.
      </p>

      ${
        error
          ? `<div class="admin-modules-error">${error}</div>`
          : ''
      }

      ${
        saved
          ? `<div class="admin-modules-saved">
              <strong>Configuration saved.</strong> The running server is not updated yet.
              Stop Saito, run
              <span class="admin-cmd-line">
                <b>npm run compile</b>
                <button type="button" class="admin-copy-cmd" data-cmd="npm run compile" title="Copy to clipboard" aria-label="Copy to clipboard"><i class="fa-solid fa-copy"></i></button>
              </span>
              then start Saito again. Compile rebuilds the browser bundle; restart loads the new server modules.
            </div>`
          : ''
      }

      <input
        type="search"
        class="admin-input"
        id="admin-modules-filter"
        placeholder="Find a module"
        value="${filter || ''}"
      />

      <div class="admin-modules-grid">
        ${present.map(card).join('') || '<p class="admin-modules-empty">No modules found in the mods directory.</p>'}
      </div>

      ${
        missing.length
          ? `<div class="admin-modules-missing">
              <h2>In configuration, but not installed</h2>
              <p>These modules are listed in the current configuration, but there is no matching directory in <code>mods/</code>.</p>
              <div class="admin-modules-grid">
                ${missing.map(card).join('')}
              </div>
            </div>`
          : ''
      }
    </div>
  `;
};
