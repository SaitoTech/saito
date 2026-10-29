const PaymentsTemplate = require('./mixin-admin.template');

class MixinAdmin {
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
    this.purpose = '';
    this.page = 1;
    this.total = 0;
    this.apiKeyConfigured = undefined;
    this.apiKeyText = '';
    this.savingApiKey = false;
    this.depositAddresses = [];
    this.operationMode = 'local';
    this.providerKeys = [];
    this.delegateKeys = [];
    this.providerDraft = '';
    this.delegateDraft = '';
    this.savingOperation = false;
    this.operationNotice = '';
  }

  admin() {
    return this.app.modules.returnModule('Admin');
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
    this.purpose = '';
    this.page = 1;
    this.total = 0;
    this.apiKeyConfigured = undefined;
    this.apiKeyText = '';
    this.savingApiKey = false;
    this.depositAddresses = [];
    this.operationMode = 'local';
    this.providerKeys = [];
    this.delegateKeys = [];
    this.providerDraft = '';
    this.delegateDraft = '';
    this.savingOperation = false;
    this.operationNotice = '';

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
        purpose: this.purpose,
        page: this.page,
        total: this.total,
        apiKeyConfigured: this.apiKeyConfigured,
        apiKeyText: this.apiKeyText,
        savingApiKey: this.savingApiKey,
        depositAddresses: this.depositAddresses,
        operationMode: this.operationMode,
        providerKeys: this.providerKeys,
        delegateKeys: this.delegateKeys,
        providerDraft: this.providerDraft,
        delegateDraft: this.delegateDraft,
        savingOperation: this.savingOperation,
        operationNotice: this.operationNotice
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
        this.purpose = document.getElementById('admin-payments-purpose')?.value || '';
        this.page = 1;
        return this.load();
      };
    }

    const purpose = document.getElementById('admin-payments-purpose');
    if (purpose) {
      purpose.onchange = () => {
        this.purpose = purpose.value || '';
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

    const mode = document.getElementById('admin-payments-operation-mode');
    if (mode) {
      mode.onchange = () => {
        this.operationMode = mode.value || 'local';
        this.operationNotice = '';
        this.error = '';
        this.refresh();
      };
    }

    document.querySelectorAll('[data-payments-add-key]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        this.addKey(button.getAttribute('data-payments-add-key'));
      };
    });

    document.querySelectorAll('[data-payments-remove-key]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        this.removeKey(
          button.getAttribute('data-payments-remove-key'),
          button.getAttribute('data-payments-key')
        );
      };
    });

    const saveOperation = document.getElementById('admin-payments-operation-save');
    if (saveOperation) {
      saveOperation.onclick = (e) => {
        e.preventDefault();
        this.saveOperationMode();
      };
    }
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

    await this.sendAdminRequest(
      'get-admin-config',
      { module_id: 'mixin', search: this.search, purpose: this.purpose, page: this.page },
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
    if (result?.operation_mode) {
      this.operationMode = result.operation_mode;
    }
    if (Array.isArray(result?.treasury_provider_publickeys)) {
      this.providerKeys = [...result.treasury_provider_publickeys];
    }
    if (Array.isArray(result?.treasury_delegate_publickeys)) {
      this.delegateKeys = [...result.treasury_delegate_publickeys];
    }
  }

  addKey(kind) {
    const field = document.getElementById(`admin-payments-${kind}-key`);
    const value = field?.value?.trim() || '';
    if (!value) {
      this.error = 'Enter a Saito public key before adding it.';
      this.refresh();
      return;
    }
    if (!this.app.crypto.isPublicKey(value)) {
      this.error = 'That is not a valid Saito public key.';
      if (kind === 'provider') {
        this.providerDraft = value;
      } else {
        this.delegateDraft = value;
      }
      this.refresh();
      return;
    }
    const list = kind === 'provider' ? this.providerKeys : this.delegateKeys;
    if (list.includes(value)) {
      this.error = 'That public key is already configured.';
      this.refresh();
      return;
    }
    list.push(value);
    if (kind === 'provider') {
      this.providerDraft = '';
    } else {
      this.delegateDraft = '';
    }
    this.error = '';
    this.operationNotice = '';
    this.refresh();
  }

  removeKey(kind, key) {
    if (kind === 'provider') {
      this.providerKeys = this.providerKeys.filter((entry) => entry !== key);
    } else {
      this.delegateKeys = this.delegateKeys.filter((entry) => entry !== key);
    }
    this.error = '';
    this.operationNotice = '';
    this.refresh();
  }

  async saveOperationMode() {
    if (this.savingOperation) {
      return;
    }

    if (
      (this.operationMode === 'local_remote' || this.operationMode === 'remote_remote') &&
      !this.providerKeys.length
    ) {
      this.error =
        'This mode requires at least one valid Treasury provider public key before it can be saved.';
      this.operationNotice = '';
      this.refresh();
      return;
    }

    this.savingOperation = true;
    this.error = '';
    this.operationNotice = '';
    this.refresh();

    await this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mixin',
        data: {
          action: 'save-operation-mode',
          operation_mode: this.operationMode,
          treasury_provider_publickeys: this.providerKeys,
          treasury_delegate_publickeys: this.delegateKeys,
          search: this.search,
          purpose: this.purpose,
          page: this.page
        }
      },
      (res) => {
        this.savingOperation = false;
        if (res?.err) {
          this.error = res.err;
          this.operationNotice = '';
          this.refresh();
          return;
        }
        this.providerDraft = '';
        this.delegateDraft = '';
        this.applyResult(res.result);
        this.operationNotice = 'Operation mode saved.';
        this.refresh();
        if (typeof siteMessage === 'function') {
          siteMessage('Operation mode saved.', 3000);
        }
      }
    );
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
        data: {
          action: 'save-api-key',
          api_key: this.apiKeyText,
          search: this.search,
          purpose: this.purpose,
          page: this.page
        }
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
        data: {
          action: 'restore-account',
          account: this.restoreText,
          search: this.search,
          purpose: this.purpose,
          page: this.page
        }
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
      {
        module_id: 'mixin',
        data: { action: 'create-account', search: this.search, purpose: this.purpose, page: this.page }
      },
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
      {
        module_id: 'mixin',
        data: { id, action: 'approve-migration', search: this.search, purpose: this.purpose, page: this.page }
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
          purpose: this.purpose,
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
      {
        module_id: 'mixin',
        data: { id, action, search: this.search, purpose: this.purpose, page: this.page }
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
}

module.exports = MixinAdmin;
