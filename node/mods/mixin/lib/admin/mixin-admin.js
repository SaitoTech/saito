const PaymentsTemplate = require('./mixin-admin.template');

function formatReservationRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`;
  }
  return `${seconds}s remaining`;
}

function parseModePair(value) {
  const [fulfillment_mode, payout_mode] = String(value || '').split(':');
  return { fulfillment_mode, payout_mode };
}

class MixinAdmin {
  constructor(app, mod, container = '.admin-payments') {
    this.app = app;
    // Browser Mixin instance that constructed this sidebar panel. Server-owned
    // payment configuration is loaded/saved through Admin get/update-admin-config,
    // not through this.mod.save() (browser options.mixin holds wallet credentials).
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
    this.fulfillment_mode = 'local';
    this.payout_mode = 'local';
    this.treasury_provider_publickeys = [];
    this.treasury_delegate_publickeys = [];
    this.treasury_provider_draft = '';
    this.treasury_delegate_draft = '';
    this.savingConfig = false;
    this.configNotice = '';
    this.tab = 'transfers';
    this.reservation_timer = null;
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
    this.fulfillment_mode = 'local';
    this.payout_mode = 'local';
    this.treasury_provider_publickeys = [];
    this.treasury_delegate_publickeys = [];
    this.treasury_provider_draft = '';
    this.treasury_delegate_draft = '';
    this.savingConfig = false;
    this.configNotice = '';
    this.tab = 'transfers';

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
    this.stopReservationCountdown();
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
        fulfillment_mode: this.fulfillment_mode,
        payout_mode: this.payout_mode,
        treasury_provider_publickeys: this.treasury_provider_publickeys,
        treasury_delegate_publickeys: this.treasury_delegate_publickeys,
        treasury_provider_draft: this.treasury_provider_draft,
        treasury_delegate_draft: this.treasury_delegate_draft,
        savingConfig: this.savingConfig,
        configNotice: this.configNotice,
        tab: this.tab
      }),
      this.container
    );
    this.attachEvents();
    this.startReservationCountdown();
  }

  stopReservationCountdown() {
    if (this.reservation_timer) {
      clearInterval(this.reservation_timer);
      this.reservation_timer = null;
    }
  }

  updateReservationCountdowns() {
    const cells = document.querySelectorAll(`${this.container} [data-reserved-until]`);
    if (!cells.length) {
      this.stopReservationCountdown();
      return;
    }
    const now = Date.now();
    cells.forEach((el) => {
      const until = Number(el.getAttribute('data-reserved-until'));
      if (!Number.isFinite(until) || until <= 0) {
        el.textContent = 'Reserved';
        return;
      }
      const remaining = until - now;
      if (remaining <= 0) {
        el.textContent = 'Reserved';
        return;
      }
      el.textContent = `Reserved · ${formatReservationRemaining(remaining)}`;
    });
  }

  startReservationCountdown() {
    this.stopReservationCountdown();
    if (this.tab !== 'addresses') {
      return;
    }
    if (!document.querySelector(`${this.container} [data-reserved-until]`)) {
      return;
    }
    this.updateReservationCountdowns();
    this.reservation_timer = setInterval(() => this.updateReservationCountdowns(), 1000);
  }

  attachEvents() {
    document.querySelectorAll('[data-payments-tab]').forEach((button) => {
      button.onclick = (e) => {
        e.preventDefault();
        const next = button.getAttribute('data-payments-tab');
        if (!next || next === this.tab) {
          return;
        }
        this.tab = next;
        this.refresh();
      };
    });

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

    const mode = document.getElementById('admin-payments-mode');
    if (mode) {
      mode.onchange = () => {
        const next = parseModePair(mode.value);
        this.fulfillment_mode = next.fulfillment_mode;
        this.payout_mode = next.payout_mode;
        this.configNotice = '';
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

    const saveConfig = document.getElementById('admin-payments-mode-save');
    if (saveConfig) {
      saveConfig.onclick = (e) => {
        e.preventDefault();
        this.saveConfig();
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
    if (result?.fulfillment_mode !== undefined) {
      this.fulfillment_mode = result.fulfillment_mode;
    }
    if (result?.payout_mode !== undefined) {
      this.payout_mode = result.payout_mode;
    }
    if (Array.isArray(result?.treasury_provider_publickeys)) {
      this.treasury_provider_publickeys = [...result.treasury_provider_publickeys];
    }
    if (Array.isArray(result?.treasury_delegate_publickeys)) {
      this.treasury_delegate_publickeys = [...result.treasury_delegate_publickeys];
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
        this.treasury_provider_draft = value;
      } else {
        this.treasury_delegate_draft = value;
      }
      this.refresh();
      return;
    }
    const list = kind === 'provider' ? this.treasury_provider_publickeys : this.treasury_delegate_publickeys;
    if (list.includes(value)) {
      this.error = 'That public key is already configured.';
      this.refresh();
      return;
    }
    if (
      kind === 'delegate' &&
      this.fulfillment_mode === 'treasury' &&
      this.payout_mode === 'local' &&
      list.length >= 1
    ) {
      this.error = 'Treasury mode allows exactly one authorized delegate.';
      this.treasury_delegate_draft = value;
      this.refresh();
      return;
    }
    list.push(value);
    if (kind === 'provider') {
      this.treasury_provider_draft = '';
    } else {
      this.treasury_delegate_draft = '';
    }
    this.error = '';
    this.configNotice = '';
    this.refresh();
  }

  removeKey(kind, key) {
    if (kind === 'provider') {
      this.treasury_provider_publickeys = this.treasury_provider_publickeys.filter((entry) => entry !== key);
    } else {
      this.treasury_delegate_publickeys = this.treasury_delegate_publickeys.filter((entry) => entry !== key);
    }
    this.error = '';
    this.configNotice = '';
    this.refresh();
  }

  async saveConfig() {
    if (this.savingConfig) {
      return;
    }

    this.savingConfig = true;
    this.error = '';
    this.configNotice = '';
    this.refresh();

    // Server-owned Mixin options are persisted by the server Mixin module's save()
    // through Admin update-admin-config. Browser this.mod.save() would write the
    // lite client's wallet credentials, not the payment server configuration.
    await this.sendAdminRequest(
      'update-admin-config',
      {
        module_id: 'mixin',
        data: {
          action: 'save-config',
          fulfillment_mode: this.fulfillment_mode,
          payout_mode: this.payout_mode,
          treasury_provider_publickeys: this.treasury_provider_publickeys,
          treasury_delegate_publickeys: this.treasury_delegate_publickeys,
          search: this.search,
          purpose: this.purpose,
          page: this.page
        }
      },
      (res) => {
        this.savingConfig = false;
        if (res?.err) {
          this.error = res.err;
          this.configNotice = '';
          this.refresh();
          return;
        }
        this.treasury_provider_draft = '';
        this.treasury_delegate_draft = '';
        this.applyResult(res.result);
        this.configNotice = 'Configuration saved.';
        this.refresh();
        if (typeof siteMessage === 'function') {
          siteMessage('Configuration saved.', 3000);
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
