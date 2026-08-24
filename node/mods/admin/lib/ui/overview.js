const OverviewTemplate = require('./overview.template');

class AdminOverviewUI {
  constructor(app, mod, container = '.admin-overview') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(
      OverviewTemplate(this.app, this.mod),
      this.container
    );
  }
}

module.exports = AdminOverviewUI;
