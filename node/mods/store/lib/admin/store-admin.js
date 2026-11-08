const StoreAdminTemplate = require('./store-admin.template');

class StoreAdmin {
  constructor(app, mod, container = '.admin-store') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.loading = false;
    this.error = '';
    this.enabled = false;
    this.treasury_publickey = '';
    this.discovered_publickey = '';
    this.confirming = false;
  }

  admin() {
    return this.app.modules.returnModule('Admin');
  }

  render() {
    this.loading = true;
    this.error = '';
    this.confirming = false;
    this.paint();
    void this.load();
  }

  paint() {
    this.app.browser.replaceElementContentBySelector(
      StoreAdminTemplate({
        loading: this.loading,
        error: this.error,
        enabled: this.enabled,
        treasury_publickey: this.treasury_publickey,
        discovered_publickey: this.discovered_publickey,
        confirming: this.confirming
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
    root.querySelector('[data-action="toggle-web3"]')?.addEventListener('change', (event) => {
      const checked = event.target.checked === true;
      if (!checked) {
        this.confirming = false;
        void this.disable();
        return;
      }
      if (!this.discovered_publickey) {
        this.error = 'Mixin has no configured issuance identity.';
        this.confirming = false;
        this.paint();
        return;
      }
      this.error = '';
      this.confirming = true;
      this.paint();
    });
    root.querySelector('[data-action="authorize-web3"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      void this.authorize();
    });
    root.querySelector('[data-action="cancel-web3"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.confirming = false;
      this.paint();
    });
  }

  apply(result = {}) {
    this.enabled = result.enabled === true;
    this.treasury_publickey = String(result.treasury_publickey || '');
    this.discovered_publickey = String(result.discovered_publickey || '');
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

  async authorize() {
    this.loading = true;
    this.paint();
    const res = await this.sendAdminRequest('update-admin-config', {
      module_id: 'store',
      data: {
        action: 'authorize',
        treasury_publickey: this.discovered_publickey
      }
    });
    this.loading = false;
    this.confirming = false;
    if (res?.err) {
      this.error = res.err;
    } else {
      this.apply(res.result);
      this.error = '';
    }
    this.paint();
  }

  async disable() {
    this.loading = true;
    this.paint();
    const res = await this.sendAdminRequest('update-admin-config', {
      module_id: 'store',
      data: { action: 'disable' }
    });
    this.loading = false;
    if (res?.err) {
      this.error = res.err;
    } else {
      this.apply(res.result);
      this.error = '';
    }
    this.paint();
  }
}

module.exports = StoreAdmin;
