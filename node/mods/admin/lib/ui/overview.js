const OverviewTemplate = require('./overview.template');
const AdminNetworkUI = require('./network');

class AdminOverviewUI {
  constructor(app, mod, container = '.admin-overview') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.balance = '—';
    this.balance_loading = false;
    this.saving = false;
    this.network_ui = new AdminNetworkUI(app, mod);
  }

  render() {
    this.refresh();
    this.loadBalance();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      OverviewTemplate(this.app, this.mod, {
        balance: this.balance_loading && this.balance === '—' ? '…' : this.balance
      }),
      this.container
    );
    this.attachEvents();
    this.network_ui.render();
  }

  attachEvents() {
    const copy = document.getElementById('admin-copy-server-key');
    if (copy) copy.onclick = () => this.copyServerKey(copy);
    const home = document.getElementById('admin-server-home');
    if (home) {
      home.onchange = () => this.saveHome(home.value);
    }
  }

  async copyServerKey(button) {
    const key = this.mod.server_publickey;
    if (!key || button.disabled) return;
    const status = document.querySelector(`${this.container} .admin-key-copy-status`);
    const focused = document.activeElement;
    let usedSelection = false;
    button.disabled = true;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(key);
          copied = true;
        } catch (err) {
          // HTTP nodes and browsers denying clipboard access can use selection copying.
        }
      }
      if (!copied) {
        usedSelection = true;
        const textarea = document.createElement('textarea');
        textarea.value = key;
        textarea.readOnly = true;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.append(textarea);
        try {
          textarea.select();
          copied = document.execCommand('copy');
        } finally {
          textarea.remove();
        }
      }
    } catch (err) {
      copied = false;
    } finally {
      button.disabled = false;
      if (usedSelection) focused?.focus();
      button.querySelector('i').className = copied ? 'fa-solid fa-check' : 'fa-solid fa-copy';
      if (status) status.textContent = copied ? 'Public key copied.' : 'Copy failed. Select the public key and copy it manually.';
    }
  }

  async saveHome(defaultModule) {
    if (!defaultModule || this.saving) return;
    await this.saveOptions({ defaultModule });
  }

  async saveOptions(data) {
    this.saving = true;
    try {
      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );
      tx.msg = {
        module: 'Admin',
        request: 'update-options',
        data
      };
      await tx.sign();

      let ok = false;
      await this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          const res =
            typeof res_tx.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
          if (res?.err) {
            if (typeof siteMessage === 'function') {
              siteMessage(res.err, 5000);
            }
            return;
          }

          this.mod.server_info = this.mod.server_info || {};
          this.mod.server_info.options = {
            ...this.mod.server_info.options,
            ...data
          };
          ok = true;
          if (typeof siteMessage === 'function') {
            siteMessage('Server settings saved.', 3000);
          }
        },
        this.mod.server_publickey
      );
      return ok;
    } catch (err) {
      if (typeof siteMessage === 'function') {
        siteMessage(err.message || String(err), 5000);
      }
      return false;
    } finally {
      this.saving = false;
    }
  }

  async loadBalance() {
    const key = this.mod.server_publickey;
    if (!key || this.balance_loading) return;

    this.balance_loading = true;
    this.updateBalanceDisplay('…');

    try {
      const response = await fetch(`/balance/${encodeURIComponent(key)}`);
      if (!response.ok) {
        throw new Error('unavailable');
      }
      const text = await response.text();
      let total = 0n;
      for (const line of text.trim().split('\n')) {
        const cols = line.split(' ');
        if (cols.length < 5) continue;
        try {
          total += BigInt(cols[4]);
        } catch (err) {
          // skip malformed rows
        }
      }
      this.balance = `${this.app.wallet.convertNolanToSaito(total)} SAITO`;
    } catch (err) {
      this.balance = '—';
    } finally {
      this.balance_loading = false;
      this.updateBalanceDisplay(this.balance);
    }
  }

  updateBalanceDisplay(text) {
    const el = document.querySelector(`${this.container} .admin-server-balance`);
    if (el) {
      el.textContent = text;
    }
  }
}

module.exports = AdminOverviewUI;
