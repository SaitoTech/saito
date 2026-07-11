const ProfileTemplate = require('./profile.template');

class Profile {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.profile = null;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.profile = this.mod.profile;

    this.app.browser.replaceElementContentBySelector(ProfileTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Profile;
