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

    this.attachEvents();
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

