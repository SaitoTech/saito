const SettingsTemplate = require('./settings.template');

class Settings {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.dark_mode = true;
    this.notifications_enabled = true;
    this.curated_feed = true;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(SettingsTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Settings;
