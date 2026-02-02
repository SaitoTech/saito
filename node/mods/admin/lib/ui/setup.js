const NodeSetupTemplate = require("./setup.template");

class NodeSetup {

  constructor(app, mod, container = ".admin-setup") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {

    if (!document.querySelector(".node-setup-options")) {
      this.app.browser.addElementToSelector(
        NodeSetupTemplate(),
        this.container
      );
    } else {
      this.app.browser.replaceElementBySelector(
        NodeSetupTemplate(),
        this.container
      );
    }

    this.attachEvents();
  }

  attachEvents() {

    document.querySelectorAll(".node-setup-card").forEach(card => {
      card.onclick = async () => {

        const choice = card.dataset.choice;

        // lock UI
        document.querySelector(".node-setup-options").style.display = "none";
        document.querySelector(".node-setup-working").style.display = "flex";

        siteMessage("Customizing your Node Setup...");

        // clone options defensively
        const currentOptions =
          JSON.parse(JSON.stringify(this.mod.server_info.options || {}));

        // apply configuration
        const updatedOptions =
          await this.configureOptionsForChoice(currentOptions, choice);

        // submit to server
        await this.submitOptions(updatedOptions);
      };
    });

  }

  /**
   * Apply configuration based on user choice.
   * This is intentionally explicit and imperative.
   */
  async configureOptionsForChoice(options, choice) {

    if (choice === "development") {

      // local dev assumptions
      options.consensus = options.consensus || {};
      options.consensus.disable_block_production = false;

      // future: faucet keys, dev flags, etc.
      // options.dev = { enabled: true };

    }

    if (choice === "production") {

      options.consensus = options.consensus || {};
      options.consensus.disable_block_production = true;

      // future: production-safe defaults
      // remove dev-only flags here if present

    }

    return options;
  }

  async submitOptions(options) {

    let tx =
      await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );

    tx.msg = {
      module: "Admin",
      request: "update-options",
      data: options
    };

    await tx.sign();

    this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
      let res = res_tx.returnMessage();
      if (res?.err) {
        salert(res.err);
        reloadWindow(1500);
      } else {
        reloadWindow(1500);
      }
    });
  }
}

module.exports = NodeSetup;


