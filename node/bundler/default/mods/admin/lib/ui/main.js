const MainTemplate = require("./main.template");
const AdminModulesUI = require("./modules");
const AdminOverviewUI = require("./overview");
const AdminOptionsUI = require("./options");
const AdminPeersUI = require("./peers");
const AdminDatabaseUI = require("./database");

class AdminMain {

  constructor(app, mod, container = ".saito-container") {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.modules_ui = new AdminModulesUI(app, mod);
    this.options_ui = new AdminOptionsUI(app, mod);
    this.overview_ui = new AdminOverviewUI(app, mod);
    this.peers_ui = new AdminPeersUI(app, mod);
    this.database_ui = new AdminDatabaseUI(app, mod);
  }

  render(view="overview") {

    if (need_to_set_key && view != "overview") {
      alert("You need to set your Admin Key first...");
      voew = "overview";
      return;
    }

    //
    // admin key is priority
    //
    this.renderComponent(view);

  }

  renderComponent(view="overview") {

    if (need_to_set_key && view != "overview") {
      alert("You need to set your Admin Key first...");
      view = "overview";
    }

    document.querySelector(".saito-container").innerHTML = "";
    this.app.browser.addElementToSelector(MainTemplate(this.app, this.mod), this.container);

    document.querySelectorAll(".saito-admin-nav-item").forEach((el) => {
      el.classList.remove("active");
    });
    document.querySelectorAll(`.saito-admin-nav-item .${view}`).forEach((el) => {
      el.classList.add("active");
    });

    if (view == "overview") {
      this.overview_ui.render();
    }

    if (view == "peers") {
      this.peers_ui.render();
    }

    if (view == "database") {
      this.database_ui.render();
    }

    if (view == "modules") {
      this.modules_ui.render();
    }

    if (view == "options") {
      this.options_ui.render();
    }

    this.attachEvents();
  }


  attachEvents() {
    document.querySelectorAll("[data-admin-view]").forEach((el) => {
      el.onclick = (e) => {
        const view = e.currentTarget.getAttribute("data-admin-view");
	this.renderComponent(view);
      };
    });
  }


  updateHeader(msg) {
    try {
      document.querySelector(".admin-header").innerHTML = msg;
    } catch (err) {}
  }

  updateInfo(msg) {
    try {
      document.querySelector(".admin-info").innerHTML = msg;
    } catch (err) {}
  }

}

module.exports = AdminMain;

