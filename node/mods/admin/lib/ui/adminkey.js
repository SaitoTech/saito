const AdminKeyTemplate = require('./adminkey.template');

class AdminKeyUI {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(
      AdminKeyTemplate(this.mod.publicKey),
      this.container
    );
    this.attachEvents();
  }

  attachEvents() {
    const btn = document.getElementById('submit-admin-key');
    if (!btn) {
      return;
    }

    btn.onclick = async () => {
      let publicKey = document.getElementById('admin-public-key')?.value;

      if (!this.app.crypto.isPublicKey(publicKey)) {
        salert('Not a valid Saito public key!');
        return;
      }

      btn.disabled = true;
      siteMessage('Registering Admin Key...');

      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );

      tx.msg = {
        module: 'Admin',
        request: 'set-admin-key',
        key: publicKey
      };

      await tx.sign();

      this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          let res = res_tx.returnMessage();
          if (res?.err) {
            salert(res.err);
            btn.disabled = false;
          } else {
            this.app.wallet.backupWallet();
            siteMessage('Admin key successfully set, downloaded copy! Reloading page...');
            reloadWindow(1200);
          }
        },
        this.mod.server_publickey
      );
    };
  }
}

module.exports = AdminKeyUI;
