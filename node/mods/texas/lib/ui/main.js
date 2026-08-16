const MainTemplate = require('./main.template');
const Table = require('./table');
const Sidebar = require('./sidebar');
const Log = require('./log');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.table = new Table(app, mod);
    this.sidebar = new Sidebar(app, mod);
    this.log = new Log(app, mod);
  }

  html() {
    return MainTemplate();
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-main')) {
      this.app.browser.addElementToDom(MainTemplate());
    }

    this.table.render();
    this.sidebar.render();
    this.log.render();
  }
}

module.exports = Main;
