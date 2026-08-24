const ModulesTemplate = require('./modules.template');

const MODE_LABELS = {
  off: 'Off',
  both: 'Both',
  server: 'Server',
  client: 'Client'
};

class AdminModulesUI {
  constructor(app, mod, container = '.admin-modules') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.modules = [];
    this.dirty = false;
    this.saved = false;
    this.error = '';
    this.filter = '';
  }

  render() {
    this.error = '';
    this.saved = false;
    this.dirty = false;
    this.filter = '';

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-modules-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.modules = this.buildModuleList();
    this.refresh();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      ModulesTemplate(this.modules, {
        dirty: this.dirty,
        saved: this.saved,
        error: this.error,
        filter: this.filter
      }),
      this.container
    );
    this.attachEvents();
    this.applyFilter();
  }

  buildModuleList() {
    const available = this.mod.server_info?.available_modules || [];
    const config = this.mod.server_info?.module_config || { core: [], lite: [] };
    const core = new Set((config.core || []).map((entry) => this.moduleNameFromPath(entry)));
    const lite = new Set((config.lite || []).map((entry) => this.moduleNameFromPath(entry)));
    const seen = new Set();
    const modules = [];

    for (const name of available) {
      seen.add(name);
      modules.push({
        name,
        mode: this.modeFromLists(name, core, lite),
        missing: false
      });
    }

    const configured = [...core, ...lite].sort();
    for (const name of configured) {
      if (!name || seen.has(name)) {
        continue;
      }
      modules.push({
        name,
        mode: this.modeFromLists(name, core, lite),
        missing: true
      });
    }

    return modules;
  }

  moduleNameFromPath(entry) {
    if (!entry) {
      return '';
    }
    return String(entry).split('/')[0];
  }

  modeFromLists(name, core, lite) {
    const on_server = core.has(name);
    const on_client = lite.has(name);
    if (on_server && on_client) {
      return 'both';
    }
    if (on_server) {
      return 'server';
    }
    if (on_client) {
      return 'client';
    }
    return 'off';
  }

  nextMode(name, mode) {
    if (name === 'admin') {
      return mode === 'server' ? 'both' : 'server';
    }
    const order = ['off', 'both', 'server', 'client'];
    const index = order.indexOf(mode);
    return order[(index + 1) % order.length];
  }

  applyFilter() {
    const q = this.filter.trim().toLowerCase();
    document.querySelectorAll('.admin-module-card').forEach((card) => {
      const name = card.dataset.module || '';
      card.style.display = !q || name.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  attachEvents() {
    const filter = document.getElementById('admin-modules-filter');
    if (filter) {
      filter.oninput = (e) => {
        this.filter = e.currentTarget.value;
        this.applyFilter();
      };
    }

    document.querySelectorAll('.admin-module-card').forEach((card) => {
      card.onclick = () => {
        const name = card.dataset.module;
        const item = this.modules.find((m) => m.name === name);
        if (!item) {
          return;
        }

        item.mode = this.nextMode(item.name, item.mode);
        this.dirty = true;
        this.saved = false;
        this.error = '';

        card.className = `admin-module-card mode-${item.mode}${item.missing ? ' missing' : ''}`;
        const badge = card.querySelector('.admin-module-mode');
        if (badge) {
          badge.textContent = MODE_LABELS[item.mode] || item.mode;
        }

        const err = document.querySelector('.admin-modules-error');
        if (err) {
          err.remove();
        }
        const saved = document.querySelector('.admin-modules-saved');
        if (saved) {
          saved.remove();
        }

        const saveBtn = document.getElementById('admin-modules-save');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      };
    });

    const saveBtn = document.getElementById('admin-modules-save');
    if (saveBtn) {
      saveBtn.onclick = () => this.save();
    }

    document.querySelectorAll('.admin-copy-cmd').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const cmd = btn.dataset.cmd;
        if (!cmd) {
          return;
        }
        navigator.clipboard.writeText(cmd).then(() => {
          if (typeof siteMessage === 'function') {
            siteMessage('command copied to clipboard...', 2000);
          }
        });
      };
    });
  }

  async save() {
    const saveBtn = document.getElementById('admin-modules-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }

    const core = [];
    const lite = [];
    for (const item of this.modules) {
      const entry = `${item.name}/${item.name}.js`;
      if (item.mode === 'both' || item.mode === 'server') {
        core.push(entry);
      }
      if (item.mode === 'both' || item.mode === 'client') {
        lite.push(entry);
      }
    }
    core.sort();
    lite.sort();

    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
    tx.msg = {
      module: 'Admin',
      request: 'update-modules-config',
      config: JSON.stringify({ core, lite })
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          this.error = res.err;
          this.saved = false;
          this.dirty = true;
          this.refresh();
          return;
        }

        if (this.mod.server_info) {
          this.mod.server_info.module_config = { core, lite };
        }
        this.modules = this.buildModuleList();
        this.dirty = false;
        this.saved = true;
        this.error = '';
        this.refresh();
        siteMessage('Module configuration saved');
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminModulesUI;
