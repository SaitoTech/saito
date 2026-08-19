module.exports = (ui) => {
  const sql = String(ui.sql || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const error = ui.error
    ? String(ui.error).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : '';
  const db_options = (ui.databases || [])
    .map(
      (name) =>
        `<option value="${name}" ${name === ui.db ? 'selected' : ''}>${name}</option>`
    )
    .join('');

  const table_options = (ui.tables || [])
    .map(
      (name) =>
        `<option value="${name}" ${name === ui.table ? 'selected' : ''}>${name}</option>`
    )
    .join('');

  return `
    <div class="admin-db-page">
      <h1>Database</h1>
      <p class="admin-db-intro">
        Inspect and modify the SQLite files in this node's data directory.
        This is an emergency tool. SQL runs as written against the selected database.
      </p>

      ${error ? `<div class="admin-db-error">${error}</div>` : ''}

      <div class="admin-db-bar">
        <label>
          Database
          <select class="admin-input" id="admin-db-select">
            <option value="">Select database</option>
            ${db_options}
          </select>
        </label>
        <label>
          Table
          <select class="admin-input" id="admin-db-table" ${ui.db ? '' : 'disabled'}>
            <option value="">Select table</option>
            ${table_options}
          </select>
        </label>
      </div>

      ${
        !ui.databases.length && !ui.busy
          ? `<p class="admin-db-empty">No SQLite databases were found in the data directory.</p>`
          : ''
      }

      ${
        ui.db
          ? `<p class="admin-db-current">Using database <strong>${ui.db}</strong>${
              ui.table ? ` → table <strong>${ui.table}</strong>` : ''
            }. SQL below runs against this database.</p>`
          : `<p class="admin-db-current">Select a database. Queries will not run until one is selected.</p>`
      }

      ${
        ui.schema.length
          ? `<div class="admin-db-schema-wrap">
              <h2>Schema${ui.table ? `: ${ui.table}` : ''}</h2>
              <div id="admin-db-schema"></div>
            </div>`
          : `<div id="admin-db-schema"></div>`
      }

      <div class="admin-db-sql">
        <h2>SQL</h2>
        <textarea class="admin-input" id="admin-sql-input" rows="6" spellcheck="false" placeholder="SELECT * FROM table LIMIT 20;">${sql}</textarea>
        <button type="button" class="admin-button" id="admin-sql-run" ${
          !ui.db || ui.busy === 'sql' ? 'disabled' : ''
        }>${ui.busy === 'sql' ? 'Running…' : 'Run Query'}</button>
      </div>

      <div class="admin-db-results">
        <h2>Results</h2>
        ${ui.status ? `<p class="admin-db-status">${ui.status}</p>` : ''}
        <div id="admin-db-output"></div>
      </div>
    </div>
  `;
};
