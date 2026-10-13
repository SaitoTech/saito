const SettingsTemplate = require('./archive-settings.template');

class ArchiveSettings {
  constructor(app, mod, container = '.saito-module-settings') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.addElementToSelector(SettingsTemplate(this.app, this.mod), this.container);
    this.attachEvents();
  }

  attachEvents() {
    let input = document.getElementById('archive-prune-public-days');
    if (!input) {
      return;
    }

    input.addEventListener('change', () => {
      let days = Number(input.value);
      if (!Number.isInteger(days) || days < 1) {
        input.value = String(this.mod.returnPrunePublicDays());
        return;
      }
      this.mod.setPrunePublicDays(days);
    });
  }
}

module.exports = ArchiveSettings;
