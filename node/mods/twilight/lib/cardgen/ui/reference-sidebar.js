const ReferenceSidebarTemplate = require('./reference-sidebar.template');

class ReferenceSidebar {
  constructor(app, mod, main, container = '.tscardgen-sidebar') {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.container = container;
  }

  async render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    host.innerHTML = '';
    this.app.browser.addElementToSelector(ReferenceSidebarTemplate(this.mod.card), this.container);
  }
}

module.exports = ReferenceSidebar;
