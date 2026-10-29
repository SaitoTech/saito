const AdminKeyTemplate = require('./adminkey.template');

class AdminKeyUI {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.submitting = false;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(
      AdminKeyTemplate(this.mod.publicKey),
      this.container
    );
    this.attachEvents();
    this.updateConnection();
  }

  updateConnection() {
    const btn = document.getElementById('submit-admin-key');
    if (!btn) return;
    const state = this.mod.server_connection.state;
    btn.disabled = this.submitting || state !== 'connected';
    const messages = {
      idle: 'Connecting to the server…',
      configured: 'Connecting to the configured server endpoint…',
      fallback: 'Trying the server at this page’s address…',
      connected: '',
      failed: 'Server connection failed.'
    };
    document.getElementById('admin-connection-status').textContent = messages[state];
    document.getElementById('admin-connection-help').hidden = state !== 'failed';
  }

  attachEvents() {
    const btn = document.getElementById('submit-admin-key');
    if (!btn) {
      return;
    }

    btn.onclick = async () => {
      if (this.submitting || this.mod.server_connection.state !== 'connected') return;
      let publicKey = document.getElementById('admin-public-key')?.value;

      if (!this.app.crypto.isPublicKey(publicKey)) {
        salert('Not a valid Saito public key!');
        return;
      }

      this.submitting = true;
      this.updateConnection();
      siteMessage('Registering Admin Key...');

      const showError = (error) => {
        siteMessage('Admin registration failed.', 5000);
        salert(error);
        this.submitting = false;
        this.updateConnection();
      };

      try {
        let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          this.mod.server_publickey
        );

        tx.msg = {
          module: 'Admin',
          request: 'set-admin-key',
          key: publicKey
        };

        await tx.sign();

        if (this.mod.server_connection.state !== 'connected') {
          throw new Error('Server connection lost. Wait for reconnection before trying again.');
        }

        await this.app.network.sendTransactionWithCallback(
          tx,
          (res_tx) => {
            // Transport failures arrive as plain { err } objects, not transactions.
            const res = typeof res_tx.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
            if (res?.err) {
              showError(res.err);
            } else {
              this.app.wallet.backupWallet();
              siteMessage('Admin key successfully set, downloaded copy! Reloading page...');
              reloadWindow(1200);
            }
          },
          this.mod.server_publickey
        );
      } catch (err) {
        showError(err.message || String(err));
      }
    };
  }
}

module.exports = AdminKeyUI;
