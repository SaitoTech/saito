const AdministratorsTemplate = require('./administrators.template');

class AdministratorsUI {
  constructor(app, mod, container = '.admin-administrators') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.admins = null;
    this.permissions = null;
    this.busy = false;
    this.error = '';
    this.notice = '';
    this.draft = '';
  }

  render() {
    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        '<p>Waiting for the server to authenticate this administrator.</p>',
        this.container
      );
      return;
    }
    this.load();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      AdministratorsTemplate({
        admins: this.admins,
        permissions: this.permissions,
        publicKey: this.mod.publicKey,
        busy: this.busy,
        error: this.error,
        notice: this.notice,
        draft: this.draft
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) return;
    root.querySelector('#admin-administrators-refresh').onclick = () => this.load();
    const input = root.querySelector('#admin-administrator-key');
    if (input)
      input.oninput = () => {
        this.draft = input.value;
      };
    const form = root.querySelector('#admin-administrator-add-form');
    if (form)
      form.onsubmit = (event) => {
        event.preventDefault();
        this.add();
      };
    root.querySelectorAll('[data-admin-action]').forEach((button) => {
      button.onclick = () => this.change(button.dataset.adminAction, button.dataset.key);
    });
  }

  applyState(state) {
    this.admins = state.admins;
    this.permissions = state.permissions;
    if (this.mod.server_info?.options) {
      this.mod.server_info.options.admin = [...state.admins];
    }
  }

  async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.refresh();
    try {
      this.applyState(await this.sendRequest('list-admins'));
    } catch (err) {
      this.error = err.message;
      this.permissions = null;
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  async add() {
    if (this.busy) return;
    const key = this.draft.trim();
    if (!this.app.crypto.isPublicKey(key)) {
      this.error = 'Not a valid Saito public key.';
      this.notice = '';
      this.refresh();
      return;
    }
    await this.change('add-admin', key);
  }

  async change(request, key) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.refresh();
    try {
      if (request !== 'add-admin') {
        const message =
          request === 'promote-admin'
            ? `Make ${key} the primary administrator? You will become a regular administrator and can then be removed.`
            : key === this.mod.publicKey
              ? 'Remove yourself as an administrator? You will lose access to this server’s admin functions.'
              : `Remove administrator ${key}? They will lose access to this server’s admin functions.`;
        if (!(await sconfirm(message))) return;
      }
      this.applyState(await this.sendRequest(request, key));
      if (request === 'add-admin') this.draft = '';
      this.notice = !this.permissions.is_admin
        ? 'You have removed yourself and no longer have administrator access.'
        : request === 'promote-admin'
          ? 'Primary status transferred. You are now a regular administrator.'
          : request === 'add-admin'
            ? 'Administrator added.'
            : 'Administrator removed.';
    } catch (err) {
      this.error = err.message;
      // Refresh permissions after rejection (for example, another admin removed us).
      try {
        this.applyState(await this.sendRequest('list-admins'));
      } catch (refreshError) {
        this.permissions = null;
      }
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  async sendRequest(request, key) {
    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
    tx.msg = { module: 'Admin', request, ...(key ? { key } : {}) };
    await tx.sign();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              'The server did not respond. Refresh to check the current administrator list.'
            )
          ),
        15000
      );
      try {
        this.app.network.sendTransactionWithCallback(
          tx,
          (res_tx) => {
            clearTimeout(timer);
            try {
              const res = res_tx.returnMessage();
              if (res?.err) throw new Error(res.err);
              if (!Array.isArray(res?.result?.admins) || !res.result.permissions) {
                throw new Error('The server returned an invalid administrator list.');
              }
              resolve(res.result);
            } catch (err) {
              reject(err);
            }
          },
          this.mod.server_publickey
        );
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}

module.exports = AdministratorsUI;
