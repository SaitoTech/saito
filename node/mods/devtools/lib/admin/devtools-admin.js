const DevToolsAdminTemplate = require('./devtools-admin.template');

const ENABLE_CONFIRMATION =
  'Compilation executes uploaded module code on this server and can crash the server. Enable server-side Saito application compilation?';

const DISABLE_CONFIRMATION =
  'Disable server-side Saito application compilation on this server? Uploaded modules will no longer be compiled.';

class DevToolsAdmin {
  constructor(app, mod, container = '.admin-devtools') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.waiting = false;
    this.loading = false;
    this.saving = false;
    this.error = '';
    this.compilation_enabled = false;
    this.generation = 0;
  }

  admin() {
    return this.app.modules.returnModule('Admin');
  }

  render() {
    this.generation += 1;
    this.waiting = false;
    this.loading = false;
    this.saving = false;
    this.error = '';
    this.compilation_enabled = false;

    if (!this.admin()?.server_info) {
      this.waiting = true;
      this.paint();
      return;
    }

    this.loading = true;
    this.paint();
    this.load(this.generation);
  }

  paint() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(
      DevToolsAdminTemplate({
        waiting: this.waiting,
        loading: this.loading,
        saving: this.saving,
        error: this.error,
        compilation_enabled: this.compilation_enabled
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    const enable = root.querySelector('#admin-devtools-enable');
    if (enable) {
      enable.onclick = () => {
        this.save(true);
      };
    }

    const disable = root.querySelector('#admin-devtools-disable');
    if (disable) {
      disable.onclick = () => {
        this.save(false);
      };
    }

  }

  async confirm(message) {
    if (typeof sconfirm === 'function') {
      return !!(await sconfirm(message));
    }
    if (typeof confirm === 'function') {
      return confirm(message) === true;
    }
    return false;
  }

  async sendAdminRequest(request, data) {
    const admin = this.admin();
    if (!admin?.server_publickey) {
      throw new Error('Server authentication has not completed.');
    }

    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(admin.server_publickey);
    tx.msg = {
      module: 'Admin',
      request,
      ...data
    };
    await tx.sign();

    return new Promise((resolve) => {
      this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          const res = typeof res_tx?.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
          resolve(res || { err: 'No response from the server.' });
        },
        admin.server_publickey
      );
    });
  }

  async load(generation = this.generation) {
    try {
      const res = await this.sendAdminRequest('get-admin-config', { module_id: 'devtools' });
      if (generation !== this.generation) {
        return;
      }
      this.loading = false;
      if (res?.err || typeof res?.result?.compilation_enabled !== 'boolean') {
        this.error = res?.err || 'DevTools configuration could not be retrieved.';
        this.compilation_enabled = false;
      } else {
        this.error = '';
        this.compilation_enabled = res.result.compilation_enabled === true;
      }
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      this.loading = false;
      this.error = err?.message || String(err);
      this.compilation_enabled = false;
    }
    if (generation === this.generation) {
      this.paint();
    }
  }

  async save(enabled) {
    if (this.saving || typeof enabled !== 'boolean') {
      return;
    }
    const confirmed = await this.confirm(enabled ? ENABLE_CONFIRMATION : DISABLE_CONFIRMATION);
    if (!confirmed) {
      return;
    }

    const generation = this.generation;
    this.saving = true;
    this.error = '';
    this.paint();

    try {
      const res = await this.sendAdminRequest('update-admin-config', {
        module_id: 'devtools',
        data: { compilation_enabled: enabled }
      });
      if (generation !== this.generation) {
        return;
      }
      this.saving = false;
      if (res?.err || typeof res?.result?.compilation_enabled !== 'boolean') {
        this.error = res?.err || 'DevTools configuration could not be saved.';
        this.compilation_enabled = false;
      } else {
        this.error = '';
        this.compilation_enabled = res.result.compilation_enabled === true;
      }
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      this.saving = false;
      this.error = err?.message || String(err);
      this.compilation_enabled = false;
    }
    if (generation === this.generation) {
      this.paint();
    }
  }
}

module.exports = DevToolsAdmin;
