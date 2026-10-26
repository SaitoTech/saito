const PaymentsTemplate = require('./payments.template');

class AdminPaymentsUI {
  constructor(app, mod, container = '.admin-payments') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.transfers = [];
    this.account = undefined;
    this.error = '';
    this.loading = false;
    this.advancing = false;
    this.creating = false;
    this.restoring = false;
    this.restoreText = '';
    this.search = '';
    this.page = 1;
    this.total = 0;
    this.apiKeyConfigured = undefined;
    this.apiKeyText = '';
    this.savingApiKey = false;
    this.depositAddresses = [];
  }

  render() {
    this.transfers = [];
    this.account = undefined;
    this.error = '';
    this.loading = true;
    this.advancing = false;
    this.creating = false;
    this.restoring = false;
    this.restoreText = '';
    this.search = '';
    this.page = 1;
    this.total = 0;
    this.apiKeyConfigured = undefined;
    this.apiKeyText = '';
    this.savingApiKey = false;
    this.depositAddresses = [];

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
        account: this.account,
        error: this.error,
        loading: this.loading,
        advancing: this.advancing,
        creating: this.creating,
        restoring: this.restoring,
        restoreText: this.restoreText,
        search: this.search,
        page: this.page,
        total: this.total,
        apiKeyConfigured: this.apiKeyConfigured,
        apiKeyText: this.apiKeyText,
        savingApiKey: this.savingApiKey,
        depositAddresses: this.depositAddresses
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

    const apiKey = document.getElementById('admin-payments-api-key-submit');
    if (apiKey) {
      apiKey.onclick = (e) => {
        e.preventDefault();
        this.saveApiKey();
      };
    }

    const create = document.getElementById('admin-payments-create-account');
    if (create) {
      create.onclick = (e) => {
        e.preventDefault();
        this.createAccount();
      };
    }

    const restore = document.getElementById('admin-payments-restore-account-button');
    if (restore) {
      restore.onclick = (e) => {
        e.preventDefault();
        this.restoreAccount();
      };
    }

    const search = document.getElementById('admin-payments-search-form');
    if (search) {
      search.onsubmit = (e) => {
        e.preventDefault();
        const next = document.getElementById('admin-payments-search')?.value?.trim() || '';
        this.search = next;
        this.page = 1;
        return this.load();
      };
    }

    document.querySelectorAll('[data-payments-page]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        if (button.disabled) {
          return;
        }
        this.page = Number(button.getAttribute('data-payments-page'));
        this.load();
      };
    });

    document.querySelectorAll('[data-payment-action]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        const action = button.getAttribute('data-payment-action');
        const id = button.getAttribute('data-payment-id');
        if (action === 'exclude-transfer') {
          const confirmed = confirm(
            `Hide transfer ${id} from Pending Transfers? It will be left out of new automatic processing. A signed transaction that was already broadcast will still be reconciled.`
          );
          if (!confirmed) {
            return;
          }
        }
        this.advance(id, action);
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

    await this.sendAdminRequest(
      'get-admin-config',
      { module_id: 'mixin', search: this.search, page: this.page },
      (res) => {
        this.loading = false;
        if (res?.err) {
          this.error = res.err;
          this.transfers = [];
        } else {
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  applyResult(result) {
    this.transfers = result?.transfers || [];
    this.total = Number(result?.total || 0);
    this.page = Number(result?.page || this.page || 1);
    if (result?.account !== undefined) {
      this.account = result.account;
    }
    if (typeof result?.api_key_configured === 'boolean') {
      this.apiKeyConfigured = result.api_key_configured;
    }
    if (Array.isArray(result?.deposit_addresses)) {
      this.depositAddresses = result.deposit_addresses;
    }
  }

  async saveApiKey() {
    const field = document.getElementById('admin-payments-api-key');
    this.apiKeyText = field?.value || '';
    if (!this.apiKeyText.trim()) {
      this.error = 'Enter the Mixin API key JSON.';
      this.refresh();
      return;
    }

    this.savingApiKey = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mixin',
        data: { action: 'save-api-key', api_key: this.apiKeyText, search: this.search, page: this.page }
      },
      (res) => {
        this.savingApiKey = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.apiKeyText = '';
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  async restoreAccount() {
    const field = document.getElementById('admin-payments-restore-account');
    this.restoreText = field?.value || '';
    if (!this.restoreText.trim()) {
      this.error = 'Paste the Mixin account JSON to restore it.';
      this.refresh();
      return;
    }

    this.restoring = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mixin',
        data: { action: 'restore-account', account: this.restoreText, search: this.search, page: this.page }
      },
      (res) => {
        this.restoring = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.restoreText = '';
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  async createAccount() {
    this.creating = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      { module_id: 'mixin', data: { action: 'create-account', search: this.search, page: this.page } },
      (res) => {
        this.creating = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  async approveMigration(id) {
    return this.sendAdminRequest(
      'update-admin-config',
      { module_id: 'mixin', data: { id, action: 'approve-migration', search: this.search, page: this.page } },
      (res) => {
        this.advancing = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  async verifyMigration(id, amount, txHash) {
    return this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mixin',
        data: {
          id,
          action: 'verify-migration',
          amount,
          tx_hash: txHash,
          search: this.search,
          page: this.page
        }
      },
      (res) => {
        this.advancing = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }

  async advance(id, action) {
    if (action === 'approve-migration') {
      this.advancing = true;
      this.error = '';
      this.refresh();
      return this.approveMigration(id);
    }
    if (action === 'verify-migration') {
      const amount = document.querySelector(`[data-migration-amount="${id}"]`)?.value || '';
      const hash = document.querySelector(`[data-migration-hash="${id}"]`)?.value || '';
      this.advancing = true;
      this.error = '';
      this.refresh();
      return this.verifyMigration(id, amount, hash);
    }
    this.advancing = true;
    this.error = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      { module_id: 'mixin', data: { id, action, search: this.search, page: this.page } },
      (res) => {
        this.advancing = false;
        if (res?.err) {
          this.error = res.err;
        } else {
          this.applyResult(res.result);
        }
        this.refresh();
      }
    );
  }
}

module.exports = AdminPaymentsUI;
