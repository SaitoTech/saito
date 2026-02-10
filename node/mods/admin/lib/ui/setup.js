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
        NodeSetupTemplate(this.mod),
        this.container
      );
    } else {
      this.app.browser.replaceElementBySelector(
        NodeSetupTemplate(this.mod),
        this.container
      );
    }

    this.attachEvents();
  }

  attachEvents() {

    //
    // Splash selection (immediate)
    //
    var updating_home_app = false;
    document.querySelectorAll(".splash-card").forEach(card => {
      card.onclick = async () => {

        if (updating_home_app) { alert("Updating... please wait."); return; }
        updating_home_app = true;

        const app_id = card.dataset.app;
        card.classList.add("selected");

        let tx =
          await this.app.wallet.createUnsignedTransactionWithDefaultFee(
            this.mod.server_publickey
          );

        tx.msg = {
          module: "Admin",
          request: "update-options",
          data: {
            defaultModule: app_id
          }
        };

        await tx.sign();

        this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
          let res = res_tx.returnMessage();
          updating_home_app = false;
          if (res?.err) {
            salert(res.err);
            card.classList.remove("working");
          } else {
            siteMessage(`Home Application will update on next Server Refresh...`, 2000);
          }
        });
      };
    });



    //
    // node setup options
    //
    document.querySelectorAll(".node-setup-card").forEach(card => {
      card.onclick = async () => {

        const choice = card.dataset.choice;

        // lock UI
        document.querySelector(".node-setup-options").style.display = "none";
        document.querySelector(".node-setup-working").style.display = "flex";
	document.querySelector(".splash-grid").style.display = "none";
	document.querySelectorAll(".node-setup-info").forEach((el)=> { el.style.display = "none"; });

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
      options.consensus.default_social_stake = 0;
      options.consensus.default_social_stake_period = 0;
      options.homeModule = "Admin";

      setTimeout(() => {
	document.querySelector(".admin-header").innerHTML = "Ready for Command-Line Recompile:";
	document.querySelector(".admin-server").style.display = "none";
	document.querySelector(".node-setup-explainer").style.display = "none";
	document.querySelector(".node-setup-working").style.display = "none";
	document.querySelector(".node-setup-dev-info").style.display = "block";
	document.querySelectorAll(".node-setup-info").forEach((el)=> { el.style.display = "none"; });
	document.querySelector(".splash-grid").style.display = "none";
      }, 200);

    }

    if (choice === "production") {

      options.consensus = options.consensus || {};
      options.consensus.disable_block_production = true;
      options.consensus.disable_block_production = true;
      options.homeModule = "Admin";

      options.peers = [];
      options.peers.push({
	host: "eames.saito.io" ,
	port: "443" ,
	protocol: "https" ,
	synctype: "full"
      });

      setTimeout(() => {
	document.querySelector(".admin-header").innerHTML = "Ready for Command-Line Recompile:";
	document.querySelector(".admin-server").style.display = "none";
	document.querySelector(".node-setup-explainer").style.display = "none";
	document.querySelector(".node-setup-working").style.display = "none";
	document.querySelector(".splash-grid").style.display = "none";
	document.querySelectorAll(".node-setup-info").forEach((el)=> { el.style.display = "none"; });
	document.querySelector(".node-setup-dev-info").innerHTML = `

	  Your server is configured to connect to the network.

	  <p></p>

	  Please run the following command:

	  <p></p>

	  npm run setupprod

	  <p></p>

	  After restarting, return here to configure your modules / setup.

	`;
	document.querySelector(".node-setup-dev-info").style.display = "block";
      }, 1000);

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


