const MainTemplate = require('./main.template');
const AdminKeyUI = require('./adminkey');
const AdminSetup = require('./setup');
const AdminOverviewUI = require('./overview');
const AdminModulesUI = require('./modules');
const AdminPeersUI = require('./peers');
const AdminDatabaseUI = require('./database');
const AdminBlocksUI = require('./blocks');
const AdminMempoolUI = require('./mempool');
const AdminFaucetUI = require('./faucet');

class AdminMain {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.mode = '';
    this.current_view = 'overview';
    this.shell_rendered = false;
    this.adminkey_ui = new AdminKeyUI(app, mod);
    this.setup_ui = new AdminSetup(app, mod);
    this.overview_ui = new AdminOverviewUI(app, mod);
    this.modules_ui = new AdminModulesUI(app, mod);
    this.peers_ui = new AdminPeersUI(app, mod);
    this.database_ui = new AdminDatabaseUI(app, mod);
    this.blocks_ui = new AdminBlocksUI(app, mod);
    this.mempool_ui = new AdminMempoolUI(app, mod);
    this.faucet_ui = new AdminFaucetUI(app, mod);
  }

  hasAdminKey() {
    return !need_to_set_key;
  }

  isSetupComplete() {
    if (this.mod.server_info?.options?.defaultModule) {
      return true;
    }
    if (typeof default_module !== 'undefined' && default_module) {
      return true;
    }
    return false;
  }

  render(view = this.current_view) {
    if (!this.hasAdminKey()) {
      this.mode = 'adminkey';
      this.shell_rendered = false;
      this.adminkey_ui.render();
      return;
    }

    if (!this.isSetupComplete() || this.setup_ui.showing_recompile) {
      if (this.mode !== 'setup') {
        this.mode = 'setup';
        this.shell_rendered = false;
        this.setup_ui.render();
      }
      return;
    }

    this.mode = 'app';
    this.current_view = view;
    this.renderShell();
    this.showPage(view);

    if (view === 'overview') {
      this.overview_ui.render();
    }

    if (view === 'modules') {
      this.modules_ui.render();
    }

    if (view === 'peers') {
      this.peers_ui.render();
    }

    if (view === 'database') {
      this.database_ui.render();
    }

    if (view === 'blocks') {
      this.blocks_ui.render();
    }

    if (view === 'mempool') {
      this.mempool_ui.render();
    }

    if (view === 'faucet') {
      this.faucet_ui.render();
    }
  }

  renderShell() {
    if (this.shell_rendered && document.querySelector('.saito-admin-main')) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(
      MainTemplate(this.app, this.mod),
      this.container
    );
    this.shell_rendered = true;
    this.attachEvents();
  }

  showPage(view) {
    document.querySelectorAll('.admin-page').forEach((el) => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.saito-admin-nav-item').forEach((el) => {
      el.classList.remove('active');
    });

    const page = document.querySelector(`.admin-page.admin-${view}`);
    if (page) {
      page.style.display = 'block';
    }

    const nav = document.querySelector(`.saito-admin-nav-item[data-admin-view="${view}"]`);
    if (nav) {
      nav.classList.add('active');
    }
  }

  attachEvents() {
    document.querySelectorAll('[data-admin-view]').forEach((el) => {
      el.onclick = (e) => {
        const view = e.currentTarget.getAttribute('data-admin-view');
        this.render(view);
      };
    });
  }
}

module.exports = AdminMain;
