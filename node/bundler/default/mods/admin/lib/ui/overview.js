const AdminKeyUI = require("./adminkey");
const AdminDashboard = require("./dashboard");
const AdminSetup = require("./setup");
const OverviewTemplate = require("./overview.template");
const jsonTree = require("json-tree-viewer");

class AdminOverviewUI {

  constructor(app, mod, container = ".admin-overview") {
    this.app = app;
    this.mod = mod;
    this.adminkey_ui = new AdminKeyUI(this.app, this.mod);
    this.setup_ui = new AdminSetup(this.app, this.mod);
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

      try {
        if (this.mod?.server_info?.options?.consensus?.disable_block_production == true) {
          this.updateHeader("What are you trying to do?");
          document.querySelector(".admin-server").style.display = "none";
console.log("before setup ui render...");
          this.setup_ui.render();
console.log("after setup ui render...");
	  return;
        }
      } catch (err) {
console.log("ERRR: " +JSON.stringify(err));
      }

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

