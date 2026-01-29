const AdminKeyUI = require("./adminkey");
const AdminDashboard = require("./dashboard");
const OverviewTemplate = require("./overview.template");
const jsonTree = require("json-tree-viewer");

class AdminOverviewUI {

  constructor(app, mod, container = ".admin-overview") {
    this.app = app;
    this.mod = mod;
    this.adminkey_ui = new AdminKeyUI(this.app, this.mod);
    this.dashboard_ui = new AdminDashboard(this.app, this.mod);
    this.container = container;
  }

  render() {

    this.app.browser.replaceElementBySelector(
      OverviewTemplate(this.app, this.mod),
      this.container
    );


    if (!need_to_set_key) {
      this.updateHeader("Welcome back, Saito Admin!");
      this.dashboard_ui.render();
    } else {
      this.adminkey_ui.render();
      return;
    }


    this.attachEvents();
  }

  attachEvents() {
  }

  updateHeader(msg) {
    try {
      document.querySelector(".admin-header").innerHTML = msg; 
    } catch (err) {}
  }

}

module.exports = AdminOverviewUI;

