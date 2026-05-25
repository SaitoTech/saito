const DatabaseTemplate = require("./database.template");

class AdminDatabase {

  constructor(app, mod, container = ".admin-database") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.replaceElementBySelector(
      DatabaseTemplate(this.mod),
      this.container
    );
    this.loadDatabases();
    this.attachEvents();
  }

  attachEvents() {
    const selectEl = document.getElementById("admin-database-select");
    if (selectEl) {
      selectEl.onchange = () => this.loadTables(selectEl.value);
    }
    const queryBtn = document.getElementById("query-database-button");
    if (queryBtn) {
      queryBtn.onclick = () => this.runQuery();
    }
  }

  async sendRequest(request, data = {}, callback) {
    try {
      const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.mod.server_publickey);
      tx.msg = { module: "Admin", request, data };
      await tx.sign();
      this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        const res = res_tx.returnMessage();
        if (res?.err) callback(null, res.err);
        else callback(res?.result, null);
      }, this.mod.server_publickey);
    } catch (e) {
      callback(null, e.message || String(e));
    }
  }

  loadDatabases() {
    this.sendRequest("list-databases", {}, (result, err) => {
      if (err) return this.renderError(err);
      const sel = document.getElementById("admin-database-select");
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select Database --</option>';
      (result || []).forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
    });
  }

  loadTables(db) {
    if (!db) {
      document.getElementById("admin-database-tables-list").innerHTML = "";
      return;
    }
    this.sendRequest("list-database-tables", { db }, (result, err) => {
      const ul = document.getElementById("admin-database-tables-list");
      if (!ul) return;
      ul.innerHTML = "";
      if (err) return this.renderError(err);
      (result || []).forEach((row) => {
        const name = row.name;
        const li = document.createElement("li");
        li.textContent = name;
        li.style.cursor = "pointer";
        li.onclick = () => {
          const ta = document.getElementById("admin-sql-input");
          if (ta) ta.value = `SELECT * FROM ${name} LIMIT 20;`;
        };
        ul.appendChild(li);
      });
    });
  }

  runQuery() {
    const btn = document.getElementById("query-database-button");
    const db = document.getElementById("admin-database-select")?.value;
    const query = document.getElementById("admin-sql-input")?.value?.trim();
    if (!btn) return;
    if (!db || !query) {
      this.renderError("Select a database and enter a query.");
      return;
    }
    const origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Running...";
    this.sendRequest("run-sql-query", { db, query, params: [] }, (result, err) => {
      if (err) this.renderError(err);
      else this.renderTable(result);
      btn.disabled = false;
      btn.textContent = origLabel;
    });
  }

  renderTable(rows) {
    const out = document.getElementById("admin-database-output");
    if (!out) return;
    out.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      out.textContent = "No results";
      return;
    }
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    Object.keys(rows[0]).forEach((k) => {
      const th = document.createElement("th");
      th.textContent = k;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      Object.values(row).forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v == null ? "" : String(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    out.appendChild(table);
  }

  renderError(msg) {
    const out = document.getElementById("admin-database-output");
    if (!out) return;
    out.innerHTML = "";
    const div = document.createElement("div");
    div.textContent = msg || "Error";
    out.appendChild(div);
  }
}

module.exports = AdminDatabase;
