module.exports = (mod) => {
  let dbOptions = "";
  if (mod?.server_info?.databases && mod.server_info.databases.length > 0) {
    for (let db of mod.server_info.databases) {
      dbOptions += `<option value="${db.dbname}">${db.module}</option>`;
    }
  }
  const selectContent = dbOptions
    ? `<option value="">-- Select Database --</option>${dbOptions}`
    : `<option>No Databases Found</option>`;
  const selectDisabled = !dbOptions ? " disabled" : "";

return `
  <div class="admin-database">

    <h1>Database Console</h1>

    <div class="admin-database-query">

      <label>Select Database</label>
      <select id="admin-database-select"${selectDisabled}>
        ${selectContent}
      </select>

      <div class="admin-database-tables">
        <h3>Tables</h3>
        <ul id="admin-database-tables-list"></ul>
      </div>

      <label>SQL Query</label>
      <textarea id="admin-sql-input"
        placeholder="SELECT * FROM table LIMIT 20;">
      </textarea>

      <button id="query-database-button">
        Run Query
      </button>

    </div>

    <div class="admin-database-results">
      <h3>Results</h3>
      <div id="admin-database-output"></div>
    </div>

  </div>
`;

};
