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
      view = "overview";
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
    document.querySelectorAll(`.saito-admin-nav-item.${view}`).forEach((el) => {
      el.classList.add("active");
    });

    this.setActivePanel(view);

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


  setActivePanel(view) {
    const panels = {
      overview: ".admin-overview",
      modules: ".admin-modules",
      peers: ".admin-peers",
      database: ".admin-database",
      blocks: ".admin-blocks",
      mempool: ".admin-memepool",
      options: ".admin-options"
    };

    Object.values(panels).forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) {
        el.style.display = "none";
      }
    });

    const active = panels[view];
    if (active) {
      const el = document.querySelector(active);
      if (el) {
        el.style.display = "";
      }
    }
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

