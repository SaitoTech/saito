const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

module.exports = (ui) => {
  const config = ui.external;
  const opening = `<details class="admin-external-db" ${ui.externalOpen ? 'open' : ''}>
    <summary>External database</summary>`;
  if (!config)
    return `${opening}<p>Loading settings…</p></details>`;
  return `${opening}
    <p>Choose PostgreSQL for selected modules. Other modules use local SQLite. Changes apply after restarting the node.</p>
    <p>Switching does not copy existing SQLite data. Startup creates missing databases and empty schemas, and stops if connection, creation or schema validation fails.</p>
    <form id="admin-external-db-form">
      <div class="admin-db-bar">
        <label>Type<select class="admin-input" name="type">
          <option value="sqlite" ${config.type === 'sqlite' ? 'selected' : ''}>SQLite (local)</option>
          <option value="postgres" ${config.type === 'postgres' ? 'selected' : ''}>PostgreSQL</option>
        </select></label>
        <label>Host<input class="admin-input" name="host" value="${escape(config.host)}" placeholder="localhost or postgres://db.example.com?sslmode=verify-full"></label>
        <label>Port<input class="admin-input" name="port" type="number" min="1" max="65535" value="${escape(config.port)}"></label>
        <label>Username<input class="admin-input" name="username" autocomplete="off" value="${escape(config.username)}"></label>
        <label>Password<input class="admin-input" name="password" type="password" autocomplete="new-password" value="${escape(config.password)}" placeholder="${config.hasPassword ? 'Leave blank to keep saved password' : 'Password'}"></label>
        <label><span>Clear saved password</span><input type="checkbox" name="clearPassword" ${config.clearPassword ? 'checked' : ''}></label>
      </div>
      <fieldset><legend>Modules using PostgreSQL when enabled</legend>
        ${(config.availableModules || []).map((mod) => `<label class="admin-external-module"><input type="checkbox" name="modules" value="${escape(mod.id)}" ${config.modules.includes(mod.id) ? 'checked' : ''}> ${escape(mod.name)}</label>`).join('') || '<p>No installed modules support PostgreSQL.</p>'}
      </fieldset>
      <div class="admin-external-actions">
        <button type="button" class="admin-button" id="admin-external-test" ${ui.externalBusy ? 'disabled' : ''}>Test connection</button>
        <button type="submit" class="admin-button" ${ui.externalBusy ? 'disabled' : ''}>Save for next restart</button>
      </div>
    </form>
    ${config.restartRequired ? '<p>Saved settings differ from active settings. Restart required.</p>' : ''}
    <p role="status">${escape(ui.externalStatus)}</p>
  </details>`;
};
