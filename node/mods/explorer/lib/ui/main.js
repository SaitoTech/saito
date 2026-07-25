const MainTemplate = require('./main.template');
const Dashboard = require('./dashboard');
const BlockTeaser = require('./block-teaser');
const TransactionTeaser = require('./transaction-teaser');

class Main {
  constructor(app, mod, container = '.explorer-view') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.dashboard = new Dashboard(app, mod);
    this.blockTeaser = new BlockTeaser(app, mod);
    this.transactionTeaser = new TransactionTeaser(app, mod);
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);

    this.dashboard.render(`${this.container} .explorer-dashboard`);
    this.blockTeaser.render(`${this.container} .block-teaser`);
    this.transactionTeaser.render(`${this.container} .transaction-teaser`);
  }
}

module.exports = Main;
