const MempoolTemplate = require('./mempool.template');

class AdminMempoolUI {
  constructor(app, mod, container = '.admin-mempool') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.state = null;
    this.error = '';
    this.loading = false;
  }

  render() {
    this.state = null;
    this.error = '';
    this.loading = false;

    if (!this.mod.server_info) {
      this.app.browser.replaceElementContentBySelector(
        `<p class="admin-mempool-empty">Waiting for the server to finish authenticating this administrator.</p>`,
        this.container
      );
      return;
    }

    this.refresh();
    this.load();
  }

  refresh() {
    this.app.browser.replaceElementContentBySelector(
      MempoolTemplate({
        state: this.state,
        error: this.error,
        loading: this.loading
      }),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const btn = document.getElementById('admin-mempool-refresh');
    if (btn) {
      btn.onclick = () => this.load();
    }

    document.querySelectorAll('.admin-mempool-row').forEach((row) => {
      row.onclick = () => {
        const details = row.nextElementSibling;
        if (details && details.classList.contains('admin-mempool-details')) {
          const open = details.style.display !== 'none';
          details.style.display = open ? 'none' : 'table-row';
        }
      };
    });
  }

  async load() {
    this.loading = true;
    this.error = '';
    this.refresh();

    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );
    tx.msg = {
      module: 'Admin',
      request: 'list-mempool'
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        this.loading = false;
        const res = res_tx.returnMessage();
        if (res?.err) {
          this.error = res.err;
          this.state = null;
        } else {
          this.state = res.result || null;
        }
        this.refresh();
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminMempoolUI;
