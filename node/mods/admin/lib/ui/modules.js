const ModulesTemplate = require("./modules.template");

class AdminModulesUI {

  constructor(app, mod, container=".admin-modules") {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.modules_changed = false;
    this.initial_state = null;
  }

  render() {

    this.modules_changed = false;
    this.initial_state = null;

    this.app.browser.replaceElementBySelector(
      ModulesTemplate(this.mod),
      this.container
    );

    this.attachEvents();
  }

  attachEvents() {

    this.initial_state = Array.from(
      document.querySelectorAll(".mod-config-table input")
    ).map(el => ({ name: el.name, checked: el.checked }));

    const saveBtn = document.getElementById("modconfig-button");
    if (!saveBtn) { return; }

    document
      .querySelectorAll(".mod-config-table input")
      .forEach((input) => {
        input.onclick = (e) => {
	  e.checked = true;
          saveBtn.removeAttribute("disabled");
        };
      });

    saveBtn.onclick = async () => {

      this.initial_state = Array.from(
        document.querySelectorAll(".mod-config-table input")
      ).map(el => ({ name: el.name, checked: el.checked }));


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
	  saveBtn.setAttribute("disabled", true);
          siteMessage("Modules updated");
        }
      });
    };

  }
}

module.exports = AdminModulesUI;

