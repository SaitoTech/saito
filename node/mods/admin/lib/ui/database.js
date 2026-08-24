const DatabaseTemplate = require('./database.template');

class AdminDatabaseUI {
  constructor(app, mod, container = '.admin-database') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.databases = [];
    this.db = '';
    this.tables = [];
    this.table = '';
    this.schema = [];
    this.sql = '';
    this.rows = null;
    this.status = '';
    this.error = '';
    this.busy = '';
  }

  render() {
    this.databases = [];
    this.db = '';
    this.tables = [];
    this.table = '';
    this.schema = [];
    this.sql = '';
    this.rows = null;
    this.status = '';
    this.error = '';
    this.busy = '';

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-db-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.refresh();
    this.loadDatabases();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      DatabaseTemplate({
        databases: this.databases,
        db: this.db,
        tables: this.tables,
        table: this.table,
        schema: this.schema,
        sql: this.sql,
        status: this.status,
        error: this.error,
        busy: this.busy
      }),
      this.container
    );
    this.attachEvents();
    this.paintSchema();
    this.paintResults();
  }

  attachEvents() {
    const dbSelect = document.getElementById('admin-db-select');
    if (dbSelect) {
      dbSelect.onchange = () => {
        this.db = dbSelect.value;
        this.tables = [];
        this.table = '';
        this.schema = [];
        this.rows = null;
        this.status = '';
        this.error = '';
        this.refresh();
        if (this.db) {
          this.loadTables();
        }
      };
    }

    const tableSelect = document.getElementById('admin-db-table');
    if (tableSelect) {
      tableSelect.onchange = () => {
        this.table = tableSelect.value;
        this.schema = [];
        this.rows = null;
        this.status = '';
        this.error = '';
        if (!this.table) {
          this.refresh();
          return;
        }
        this.sql = `SELECT * FROM ${this.quoteIdent(this.table)} LIMIT 20;`;
        this.refresh();
        this.loadSchema();
        this.runQuery();
      };
    }

    const sqlInput = document.getElementById('admin-sql-input');
    if (sqlInput) {
      sqlInput.oninput = (e) => {
        this.sql = e.currentTarget.value;
      };
    }

    const runBtn = document.getElementById('admin-sql-run');
    if (runBtn) {
      runBtn.onclick = () => this.runQuery();
    }
  }

  quoteIdent(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
  }

  loadDatabases() {
    this.busy = 'databases';
    this.request('list-databases', {}, (result, err) => {
      this.busy = '';
      if (err) {
        this.error = err;
        this.refresh();
        return;
      }
      this.databases = result || [];
      this.refresh();
    });
  }

  loadTables() {
    this.busy = 'tables';
    this.request('list-database-tables', { db: this.db }, (result, err) => {
      this.busy = '';
      if (err) {
        this.error = err;
        this.tables = [];
        this.refresh();
        return;
      }
      this.tables = (result || []).map((row) => row.name || row).filter(Boolean);
      this.refresh();
    });
  }

  loadSchema() {
    const sql = `PRAGMA table_info(${this.quoteIdent(this.table)})`;
    this.request('run-sql-query', { db: this.db, query: sql }, (result, err) => {
      if (err) {
        this.error = err;
        this.schema = [];
        this.refresh();
        return;
      }
      this.schema = result?.rows || [];
      this.refresh();
    });
  }

  runQuery() {
    const sql = (this.sql || document.getElementById('admin-sql-input')?.value || '').trim();
    this.sql = sql;
    if (!this.db) {
      this.error = 'Select a database first. Queries always run against the selected database.';
      this.rows = null;
      this.status = '';
      this.refresh();
      return;
    }
    if (!sql) {
      this.error = 'Enter SQL to run against "' + this.db + '".';
      this.refresh();
      return;
    }

    this.busy = 'sql';
    this.error = '';
    this.status = '';
    this.refresh();

    this.request('run-sql-query', { db: this.db, query: sql }, (result, err) => {
      this.busy = '';
      if (err) {
        this.error = err;
        this.rows = null;
        this.status = '';
        this.refresh();
        return;
      }
      if (result?.rows) {
        this.rows = result.rows;
        this.status =
          result.rows.length === 0
            ? `Query on "${this.db}" returned no rows.`
            : `Query on "${this.db}" returned ${result.rows.length} row${
                result.rows.length === 1 ? '' : 's'
              }.`;
      } else {
        this.rows = null;
        const changes = result?.changes;
        this.status = `Statement on "${this.db}" completed.${
          typeof changes === 'number' ? ` ${changes} row${changes === 1 ? '' : 's'} changed.` : ''
        }${
          result?.lastID != null && result.lastID !== 0 ? ` lastID ${result.lastID}.` : ''
        }`;
      }
      this.refresh();
    });
  }

  paintSchema() {
    const el = document.getElementById('admin-db-schema');
    if (!el) {
      return;
    }
    el.innerHTML = '';
    if (!this.schema.length) {
      return;
    }
    el.appendChild(this.buildTable(this.schema, ['name', 'type', 'notnull', 'dflt_value', 'pk']));
  }

  paintResults() {
    const el = document.getElementById('admin-db-output');
    if (!el) {
      return;
    }
    el.innerHTML = '';
    if (!this.rows || !this.rows.length) {
      return;
    }
    el.appendChild(this.buildTable(this.rows));
  }

  buildTable(rows, columns) {
    const keys = columns || Object.keys(rows[0] || {});
    const table = document.createElement('table');
    table.className = 'admin-db-table';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    keys.forEach((key) => {
      const th = document.createElement('th');
      th.textContent = key;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      keys.forEach((key) => {
        const td = document.createElement('td');
        const value = row[key];
        if (value === null || value === undefined) {
          td.textContent = 'NULL';
          td.className = 'admin-db-null';
        } else {
          td.textContent = String(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  async request(name, data, done) {
    try {
      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );
      tx.msg = {
        module: 'Admin',
        request: name,
        data
      };
      await tx.sign();
      this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          const res = res_tx.returnMessage();
          if (res?.err) {
            done(null, res.err);
          } else {
            done(res?.result, null);
          }
        },
        this.mod.server_publickey
      );
    } catch (err) {
      done(null, err.message || String(err));
    }
  }
}

module.exports = AdminDatabaseUI;
