const MainTemplate = require('./main.template');
const AdminKeyUI = require('./adminkey');
const AdminSetup = require('./setup');
const AdminOverviewUI = require('./overview');
const AdminTokensUI = require('./tokens');
const AdminModulesUI = require('./modules');
const AdminPeersUI = require('./peers');
const AdminDatabaseUI = require('./database');
const AdminBlocksUI = require('./blocks');
const AdminMempoolUI = require('./mempool');
const AdministratorsUI = require('./administrators');

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
    this.tokens_ui = new AdminTokensUI(app, mod);
    this.modules_ui = new AdminModulesUI(app, mod);
    this.peers_ui = new AdminPeersUI(app, mod);
    this.database_ui = new AdminDatabaseUI(app, mod);
    this.blocks_ui = new AdminBlocksUI(app, mod);
    this.mempool_ui = new AdminMempoolUI(app, mod);
    this.administrators_ui = new AdministratorsUI(app, mod);
  }

  hasAdminKey() {
    return !need_to_set_key;
  }

  isSetupComplete() {
    if (this.mod.server_info?.options?.isSetupComplete === true) {
      return true;
    }
    if (typeof is_setup_complete !== 'undefined' && is_setup_complete === true) {
      return true;
    }
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
    this.syncTokensNav();

    if (view === 'tokens' && !this.isLocalDevelopment()) {
      view = 'overview';
      this.current_view = view;
    }

    this.showPage(view);

    if (view === 'overview') {
      this.overview_ui.render();
    }

    if (view === 'tokens') {
      this.tokens_ui.render();
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

    const sidebar = this.sidebarPanel(view);
    if (sidebar) {
      sidebar.render();
    }

    if (view === 'administrators') {
      this.administrators_ui.render();
    }
  }

  isLocalDevelopment() {
    return this.mod.server_info?.options?.consensus?.disable_block_production === false;
  }

  syncTokensNav() {
    const nav = document.querySelector('.saito-admin-nav-item[data-admin-view="tokens"]');
    if (nav) {
      nav.hidden = !this.isLocalDevelopment();
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

  // Installed modules contribute a panel with respondTo('admin-sidebar'):
  // { id, name, render }. Clicking the entry calls render().
  sidebarPanels() {
    return (this.app.modules.getRespondTos?.('admin-sidebar') || []).filter(
      (panel) =>
        panel &&
        typeof panel.render === 'function' &&
        panel.name &&
        /^[a-z0-9_-]+$/i.test(String(panel.id || ''))
    );
  }

  sidebarPanel(view) {
    return this.sidebarPanels().find((panel) => panel.id === view) || null;
  }

  attachEvents() {
    const darkMode = document.getElementById('admin-dark-mode');
    if (darkMode) {
      darkMode.checked = document.documentElement.getAttribute('data-admin-theme') === 'dark';
      darkMode.onchange = () => {
        const theme = darkMode.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-admin-theme', theme);
        try {
          window.localStorage.setItem('saito-admin-theme', theme);
        } catch (err) {
          // The appearance still changes when browser storage is unavailable.
        }
      };
    }

    document.querySelectorAll('[data-admin-view]').forEach((el) => {
      el.onclick = (e) => {
        const view = e.currentTarget.getAttribute('data-admin-view');
        this.render(view);
      };
    });
  }
}

module.exports = AdminMain;
