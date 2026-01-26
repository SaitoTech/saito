const ModulesTemplate = require("./modules.template");

class AdminModulesUI {

  constructor(app, mod, container=".admin-modules") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {

    this.app.browser.replaceElementBySelector(
      ModulesTemplate(this.mod),
      this.container
    );

    this.attachEvents();
  }

  attachEvents() {
    const saveBtn = document.getElementById("modconfig-button");
    if (!saveBtn) { return; }

    document
      .querySelectorAll(".mod-config-table input")
      .forEach((input) => {
        input.onchange = () => {
          saveBtn.removeAttribute("disabled");
        };
      });

    saveBtn.onclick = async () => {
      const inputs = document.querySelectorAll(".mod-config-table input");
      let new_mod_config = { lite: [], core: [] };

      Array.from(inputs).forEach((el) => {
        if (el.checked) {
          new_mod_config.lite.push(`${el.name}/${el.name}.js`);
          new_mod_config.core.push(`${el.name}/${el.name}.js`);
        }
      });

      let tx =
        await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          this.mod.server_publickey
        );

      tx.msg = {
        module: "Admin",
        request: "update-modules-config",
        config: JSON.stringify(new_mod_config),
      };

      await tx.sign();

      this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          salert(res.err);
        } else {
          siteMessage("Modules updated");
        }
      });
    };

    const toggle = document.getElementById("show-modules");
    if (toggle) {
      toggle.onclick = (e) => {
        e.currentTarget.classList.toggle("toggled");
        document
          .querySelector(".mod-config-table")
          .classList.toggle("minimize");
      };
    }
  }
}

module.exports = AdminModulesUI;

