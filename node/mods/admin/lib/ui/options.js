const OptionsTemplate = require("./options.template");
const jsonTree = require("json-tree-viewer");

class AdminOptionsUI {
  constructor(app, mod, container = ".admin-options") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {

    if (!this.mod.server_info) { return; }

    this.app.browser.replaceElementBySelector(
      OptionsTemplate(),
      this.container
    );

    try {
      const el = document.getElementById("node-options");
      const optjson = JSON.parse(
        JSON.stringify(this.mod.server_info.options, (k, v) =>
          typeof v === "bigint" ? v.toString() : v
        )
      );
      jsonTree.create(optjson, el);
    } catch (err) {
      console.error("error creating jsonTree", err);
    }

    this.injectBlockToggle(this.mod.server_info.options);
    this.attachEvents();
  }

  injectBlockToggle(config_obj) {
    let html = config_obj.consensus.disable_block_production
      ? `<button class="block-toggle" id="produce-blocks">Enable block production</button>`
      : `<button class="block-toggle" id="stop-blocks">Disable block production</button>`;

    if (document.querySelector(".block-toggle")) {
      this.app.browser.replaceElementBySelector(html, ".block-toggle");
    } else {
      this.app.browser.addElementToSelector(html, ".admin-info");
    }

    if (document.getElementById("produce-blocks")) {
      document.getElementById("produce-blocks").onclick = () =>
        this.toggleBlockProduction(false);
    }

    if (document.getElementById("stop-blocks")) {
      document.getElementById("stop-blocks").onclick = () =>
        this.toggleBlockProduction(true);
    }
  }

  async toggleBlockProduction(setValue) {
    let tx =
      await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );

    tx.msg = {
      module: "Admin",
      request: "update-options",
      data: {
        consensus: {
          disable_block_production: setValue,
        },
      },
    };

    await tx.sign();

    this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
      let res = res_tx.returnMessage();
      if (res?.err) {
        salert(res.err);
      } else {
        siteMessage("Node updated");
      }
    });
  }

  attachEvents() {
    const toggle = document.getElementById("show-options");
    if (toggle) {
      toggle.onclick = (e) => {
        e.currentTarget.classList.toggle("toggled");
        document
          .querySelector(".node-options")
          .classList.toggle("minimize");
      };
    }
  }
}

module.exports = AdminOptionsUI;

