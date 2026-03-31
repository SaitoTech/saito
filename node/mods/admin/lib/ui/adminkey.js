const AdminKeyTemplate = require("./adminkey.template");

class AdminKeyUI {
  constructor(app, mod, container = ".admin-adminkey") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {

    if (!document.querySelector(".admin-key-setup")) {
      this.app.browser.addElementToSelector(
        AdminKeyTemplate(this.mod.publicKey),
        this.container
      );
    } else {
      this.app.browser.replaceElementBySelector(
        AdminKeyTemplate(this.mod.publicKey),
        this.container
      );
    }

    this.attachEvents();
  }

  attachEvents() {

    const btn = document.getElementById("submit-admin-key");
    if (!btn) { return; }

    let clicked = false;

    btn.onclick = async (e) => {

      if (clicked == true) { alert("Key Registered: please wait or reload..."); }
      siteMessage("Registering Admin Key...");
      clicked = true;

      let publicKey = document.getElementById("admin-public-key")?.value;

      if (!this.app.crypto.isPublicKey(publicKey)) {
        salert("Not a valid Saito public key!");
        return;
      }

      e.currentTarget.onclick = null;

      let tx =
        await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          this.mod.server_publickey
        );

      tx.msg = {
        module: "Admin",
        request: "set-admin-key",
        key: publicKey,
      };

      await tx.sign();

      this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          salert(res.err);
        } else {
          this.app.wallet.backupWallet();
          siteMessage(
            "Admin key successfully set, downloaded copy! Reloading page..."
          );
          reloadWindow(1200);
        }
      });
    };
  }
}

module.exports = AdminKeyUI;


