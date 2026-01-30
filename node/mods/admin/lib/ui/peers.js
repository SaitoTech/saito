const PeersTemplate = require("./peers.template");

class AdminPeers {

  constructor(app, mod, container = ".admin-peers") {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.peers = JSON.parse(
      JSON.stringify(mod?.server_info?.options?.peers || [])
    );
  }

  render() {

    this.app.browser.replaceElementBySelector(
      PeersTemplate(this.mod),
      this.container
    );

    this.attachEvents();
  }

  markDirty() {
    document.getElementById("save-peers")?.removeAttribute("disabled");
  }

  attachEvents() {

    //
    // Remove peer
    //
    document.querySelectorAll(".peer-remove").forEach(btn => {
      btn.onclick = (e) => {
        const row = e.currentTarget.closest(".peer-row");
        const idx = parseInt(row.dataset.index, 10);
        this.peers.splice(idx, 1);
        this.markDirty();
        this.render();
      };
    });

    //
    // Add peer
    //
    const addBtn = document.getElementById("add-peer-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        const host = document.getElementById("peer-host").value.trim();
        const port = parseInt(document.getElementById("peer-port").value, 10);
        const protocol = document.getElementById("peer-protocol").value;
        const publicKey = document.getElementById("peer-key").value.trim();

        if (!host || !port || !protocol) {
          salert("Host, port, and protocol are required.");
          return;
        }

        this.peers.push({
          host,
          port,
          protocol,
          publicKey,
          synctype: "lite"
        });

        this.markDirty();
        this.render();
      };
    }

    //
    // Save peers
    //
    const saveBtn = document.getElementById("save-peers");
    if (saveBtn) {
      saveBtn.onclick = async () => {

        saveBtn.textContent = "Saving…";
        saveBtn.setAttribute("disabled", true);

        let tx =
          await this.app.wallet.createUnsignedTransactionWithDefaultFee(
            this.mod.server_publickey
          );

        tx.msg = {
          module: "Admin",
          request: "update-options",
          data: {
            peers: this.peers
          }
        };

        await tx.sign();

        this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
          let res = res_tx.returnMessage();
          if (res?.err) {
            salert(res.err);
            saveBtn.removeAttribute("disabled");
            saveBtn.textContent = "Save Changes";
          } else {
            siteMessage("Peers updated");
            reloadWindow(1200);
          }
        });
      };
    }
  }
}

module.exports = AdminPeers;

