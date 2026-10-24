const PaymentsTemplate = require('./payments.template');

class AdminPaymentsUI {
  constructor(app, mod, container = '.admin-payments') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.transfers = [];
    this.error = '';
    this.loading = false;
    this.advancing = false;
  }

  render() {
    this.transfers = [];
    this.error = '';
    this.loading = false;
    this.advancing = false;

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-payments-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.refresh();
    this.load();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      PaymentsTemplate({
        transfers: this.transfers,
        error: this.error,
        loading: this.loading,
        advancing: this.advancing
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const refresh = document.getElementById('admin-payments-refresh');
    if (refresh) {
      refresh.onclick = (e) => {
        e.preventDefault();
        this.load();
      };
    }

    document.querySelectorAll('[data-payment-action]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        this.advance(button.getAttribute('data-payment-id'), button.getAttribute('data-payment-action'));
      };
    });
  }

  async sendAdminRequest(request, data, callback) {
    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.mod.server_publickey);
    tx.msg = {
      module: 'Admin',
      request,
      ...data
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => callback(res_tx.returnMessage()),
      this.mod.server_publickey
    );
  }

  async load() {
    this.loading = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest('get-admin-config', { module_id: 'mixin' }, (res) => {
      this.loading = false;
      if (res?.err) {
        this.error = res.err;
        this.transfers = [];
      } else {
        this.transfers = res.result?.transfers || [];
      }
      this.refresh();
    });
  }

  async advance(id, action) {
    this.advancing = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      { module_id: 'mixin', data: { id, action } },
      (res) => {
        this.advancing = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.transfers = res.result?.transfers || [];
        }
        this.refresh();
      }
    );
  }
}

module.exports = AdminPaymentsUI;
