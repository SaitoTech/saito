const MODE_LABELS = {
  off: 'Off',
  both: 'Both',
  server: 'Server',
  client: 'Client'
};

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

module.exports = (modules, { dirty, saved, error, filter, filters = {} } = {}) => {
  const present = (modules || []).filter((m) => !m.missing);
  const missing = (modules || []).filter((m) => m.missing);
  const select = (field, label, values) => {
    const options = new Map();
    values.forEach((value) => options.set(value.toLowerCase() || 'unspecified', value || 'Unspecified'));
    return `<label>${label}
      <select class="admin-input" data-module-filter="${field}">
        <option value="">All</option>
        ${[...options].sort((a, b) => a[1].localeCompare(b[1])).map(([value, text]) =>
          `<option value="${escape(value)}" ${filters[field] === value ? 'selected' : ''}>${escape(text)}</option>`
        ).join('')}
      </select>
    </label>`;
  };

  const card = (m) => {
    const missing_class = m.missing ? ' missing' : '';
    const title =
      m.name === 'admin'
        ? 'Admin stays available so you can keep using this page'
        : 'Click to change';
    return `
      <button type="button" class="admin-module-card mode-${m.mode}${missing_class}" data-module="${escape(m.name)}" title="${title}">
        <span class="admin-module-name">${escape(m.name)}</span>
        <span class="admin-module-mode">${MODE_LABELS[m.mode] || m.mode}</span>
        <span class="admin-module-thumbnail" aria-hidden="true">
          ${m.image ? `<img src="${escape(m.image)}" alt="" loading="lazy" />` : ''}
        </span>
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

      ${error ? `<div class="admin-modules-error">${escape(error)}</div>` : ''}

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

      <div class="admin-modules-filters">
        <label class="admin-modules-search">Search
          <input type="search" class="admin-input" id="admin-modules-filter"
            placeholder="Search modules" value="${escape(filter)}" />
        </label>
        ${select('category', 'Category', modules.flatMap((m) => m.categories || []))}
        ${select('status', 'Status', modules.map((m) => m.status || ''))}
        ${select('class', 'Class', modules.map((m) => m.class || ''))}
        <label class="admin-modules-checkbox">
          <input type="checkbox" data-module-filter="has_description" ${filters.has_description ? 'checked' : ''} />
          has description
        </label>
        <label class="admin-modules-checkbox">
          <input type="checkbox" data-module-filter="has_image" ${filters.has_image ? 'checked' : ''} />
          has image
        </label>
      </div>
      <p class="admin-modules-count" role="status"></p>
      <p class="admin-modules-empty admin-modules-no-matches" hidden>No modules match these filters.</p>

      <div class="admin-modules-grid">
        ${present.map(card).join('')}
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
