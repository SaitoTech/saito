const StoreAdminTemplate = require('./store-admin.template');

class StoreAdmin {
  constructor(app, mod, container = '.admin-store') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(StoreAdminTemplate(), this.container);
  }
}

module.exports = StoreAdmin;
