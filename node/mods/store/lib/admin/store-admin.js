const StoreAdminTemplate = require('./store-admin.template');

class StoreAdmin {
  constructor(app, mod, container = '.admin-store') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.loading = false;
    this.error = '';
    this.enabled = false;
    this.expanded = false;
    this.treasury_publickey = '';
    this.discovered_publickey = '';
    this.draft_publickey = '';
    this.draft_dirty = false;
  }

  admin() {
    return this.app.modules.returnModule('Admin');
  }

  render() {
    this.loading = true;
    this.error = '';
    this.expanded = false;
    this.draft_dirty = false;
    this.paint();
    void this.load();
  }

  paint() {
    this.app.browser.replaceElementContentBySelector(
      StoreAdminTemplate({
        loading: this.loading,
        error: this.error,
        enabled: this.enabled,
        expanded: this.expanded,
        treasury_publickey: this.treasury_publickey,
        draft_publickey: this.draft_publickey
      }),
      this.container
    );
    this.attachEvents();
  }

  statusText() {
    const draft = String(this.draft_publickey || '').trim();
    const authorized = String(this.treasury_publickey || '').trim();
    if (this.enabled && draft === authorized) {
      return '';
    }
    if (this.enabled) {
      return 'The replacement key is not authorized until you update it.';
    }
    return 'Web3 payments will not be enabled until you confirm the server authorized to make purchases.';
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    root.querySelector('[data-action="toggle-web3"]')?.addEventListener('change', (event) => {
      if (event.target.checked !== true) {
        this.expanded = false;
        if (this.enabled) {
          void this.disable();
          return;
        }
        this.paint();
        return;
      }
      this.expanded = true;
      this.error = '';
      if (!this.draft_dirty && !this.draft_publickey) {
        this.draft_publickey = this.treasury_publickey || this.discovered_publickey;
      }
      this.paint();
    });
    root.querySelector('[data-action="web3-key"]')?.addEventListener('input', (event) => {
      this.draft_publickey = event.target.value;
      this.draft_dirty = true;
      const status = root.querySelector('[data-web3-status]');
      if (status) {
        status.textContent = this.statusText();
      }
    });
    root.querySelector('[data-action="confirm-web3"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      void this.confirm();
    });
  }

  apply(result = {}) {
    this.enabled = result.enabled === true;
    this.treasury_publickey = String(result.treasury_publickey || '');
    this.discovered_publickey = String(result.discovered_publickey || '');
    if (this.enabled) {
      this.expanded = true;
    }
    if (!this.draft_dirty) {
      this.draft_publickey = this.treasury_publickey || this.discovered_publickey;
    }
  }

  async sendAdminRequest(request, data) {
    const admin = this.admin();
    if (!admin?.server_publickey) {
      return { err: 'The admin server is not connected.' };
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
        (res) => resolve(res?.returnMessage?.() || {}),
        admin.server_publickey
      );
    });
  }

  async load() {
    const res = await this.sendAdminRequest('get-admin-config', { module_id: 'store' });
    this.loading = false;
    if (res?.err) {
      this.error = res.err;
    } else {
      this.apply(res.result);
      this.error = '';
    }
    this.paint();
  }

  async confirm() {
    const input = document.querySelector(`${this.container} [data-action="web3-key"]`);
    const submitted = String(input?.value ?? this.draft_publickey).trim();
    this.draft_publickey = submitted;
    this.draft_dirty = true;
    this.loading = true;
    this.error = '';
    this.paint();
    const res = await this.sendAdminRequest('update-admin-config', {
      module_id: 'store',
      data: {
        action: 'authorize',
        treasury_publickey: submitted
      }
    });
    this.loading = false;
    if (res?.err) {
      this.error = res.err;
      this.expanded = true;
    } else {
      this.draft_dirty = false;
      this.apply(res.result);
      this.error = '';
      if (!this.enabled) {
        this.expanded = false;
      }
    }
    this.paint();
  }

  async disable() {
    this.loading = true;
    this.expanded = false;
    this.paint();
    const res = await this.sendAdminRequest('update-admin-config', {
      module_id: 'store',
      data: { action: 'disable' }
    });
    this.loading = false;
    if (res?.err) {
      this.error = res.err;
      this.expanded = true;
    } else {
      this.draft_dirty = false;
      this.apply(res.result);
      this.error = '';
      this.expanded = false;
    }
    this.paint();
  }
}

module.exports = StoreAdmin;
