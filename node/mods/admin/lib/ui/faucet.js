const FaucetTemplate = require('./faucet.template');

class AdminFaucetUI {
  constructor(app, mod, container = '.admin-faucet') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.state = null;
    this.error = '';
    this.loading = false;
    this.filter = 'recent';
    this.config = null;
    this.config_error = '';
    this.config_loading = false;
    this.config_saving = false;
    this.config_saved = false;
  }

  render() {
    this.state = null;
    this.error = '';
    this.loading = false;
    this.filter = 'recent';
    this.config = null;
    this.config_error = '';
    this.config_loading = false;
    this.config_saving = false;
    this.config_saved = false;

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-faucet-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.refresh();
    this.load();
    this.loadConfig();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      FaucetTemplate({
        state: this.state,
        error: this.error,
        loading: this.loading,
        filter: this.filter,
        config: this.config,
        config_error: this.config_error,
        config_loading: this.config_loading,
        config_saving: this.config_saving,
        config_saved: this.config_saved
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const btn = document.getElementById('admin-faucet-refresh');
    if (btn) {
      btn.onclick = () => {
        this.load();
        this.loadConfig();
      };
    }

    document.querySelectorAll('[data-faucet-filter]').forEach((el) => {
      el.onclick = () => {
        this.filter = el.getAttribute('data-faucet-filter') || 'recent';
        this.load();
      };
    });

    document.querySelectorAll('.admin-faucet-row').forEach((row) => {
      row.onclick = () => {
        const details = row.nextElementSibling;
        if (details && details.classList.contains('admin-faucet-details')) {
          const open = details.style.display !== 'none';
          details.style.display = open ? 'none' : 'table-row';
        }
      };
    });

    const form = document.getElementById('admin-faucet-config-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.saveConfig({
          github_secret: document.getElementById('admin-faucet-github-secret')?.value || '',
          twitter_secret: document.getElementById('admin-faucet-twitter-secret')?.value || '',
          free_use: document.getElementById('admin-faucet-free-use')?.checked === true
        });
      };
    }
  }

  async sendAdminRequest(request, data, callback) {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
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

    await this.sendAdminRequest('list-faucet', { filter: this.filter }, (res) => {
      this.loading = false;
      if (res?.err) {
        this.error = res.err;
        this.state = null;
      } else {
        this.state = res.result || null;
      }
      this.refresh();
    });
  }

  async loadConfig() {
    this.config_loading = true;
    this.config_error = '';
    this.config_saved = false;
    this.refresh();

    await this.sendAdminRequest('get-admin-config', { module_id: 'faucet' }, (res) => {
      this.config_loading = false;
      if (res?.err) {
        this.config_error = res.err;
        this.config = null;
      } else {
        this.config = res.result || null;
      }
      this.refresh();
    });
  }

  async saveConfig(data) {
    this.config_saving = true;
    this.config_error = '';
    this.config_saved = false;
    this.refresh();

    await this.sendAdminRequest('update-admin-config', { module_id: 'faucet', data }, (res) => {
      this.config_saving = false;
      if (res?.err) {
        this.config_error = res.err;
      } else {
        this.config = res.result || this.config;
        this.config_saved = true;
        if (typeof siteMessage === 'function') {
          siteMessage('Faucet configuration saved');
        }
      }
      this.refresh();
    });
  }
}

module.exports = AdminFaucetUI;
