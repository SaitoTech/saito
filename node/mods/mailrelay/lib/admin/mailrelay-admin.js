const MailRelayAdminTemplate = require('./mailrelay-admin.template');

class MailRelayAdmin {
  constructor(app, mod, container = '.admin-sendgrid') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.configured = false;
    this.active = false;
    this.source = '';
    this.config = null;
    this.error = '';
    this.loading = false;
    this.saving = false;
    this.configText = '';
  }

  admin() {
    return this.app.modules.returnModule('Admin');
  }

  render() {
    this.configured = false;
    this.active = false;
    this.source = '';
    this.config = null;
    this.error = '';
    this.loading = false;
    this.saving = false;
    this.configText = '';

    if (!this.admin()?.server_info) {
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
      MailRelayAdminTemplate({
        configured: this.configured,
        active: this.active,
        source: this.source,
        config: this.config,
        error: this.error,
        loading: this.loading,
        saving: this.saving,
        configText: this.configText
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const button = document.getElementById('admin-sendgrid-submit');
    if (button) {
      button.onclick = () => this.saveConfig();
    }
  }

  applyResult(result) {
    this.configured = result?.configured === true;
    this.active = result?.active === true;
    this.source = result?.source || '';
    this.config = result?.config || null;
  }

  async sendAdminRequest(request, data, callback) {
    const admin = this.admin();
    if (!admin?.server_publickey) {
      return;
    }

    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(admin.server_publickey);
    tx.msg = {
      module: 'Admin',
      request,
      ...data
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => callback(res_tx.returnMessage()),
      admin.server_publickey
    );
  }

  async load() {
    this.loading = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest('get-admin-config', { module_id: 'mailrelay' }, (res) => {
      this.loading = false;
      if (res?.err) {
        this.error = res.err;
      } else {
        this.applyResult(res.result);
      }
      this.refresh();
    });
  }

  async saveConfig() {
    const field = document.getElementById('admin-sendgrid-config');
    this.configText = field?.value || '';
    if (!this.configText.trim()) {
      this.error = 'Enter the SendGrid configuration JSON.';
      this.refresh();
      return;
    }

    this.saving = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mailrelay',
        data: { action: 'save-config', config: this.configText }
      },
      (res) => {
        this.saving = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.configText = '';
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }
}

module.exports = MailRelayAdmin;
