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

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root || root.dataset.profileBound) {
      return;
    }

    root.dataset.profileBound = '1';

    const newPostBtn = root.querySelector('.profile-new-post');

    if (newPostBtn) {
      newPostBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.mod.compose?.open();
      });
    }
  }
}

module.exports = Profile;
