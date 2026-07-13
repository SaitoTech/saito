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
    this.syncActiveNav(this.mod.manager?.mode || 'timeline');
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
        this.mod.compose_overlay?.open();
      });
    }

    root.addEventListener('click', (e) => {
      const item = e.target.closest('.profile-nav-item');

      if (!item || !root.contains(item)) {
        return;
      }

      e.preventDefault();

      const view = item.getAttribute('data-profile-nav') || '';
      const publicKey = this.mod.publicKey || '';
      const manager = this.mod.manager;

      if (!manager) {
        return;
      }

      if (view === 'posts') {
        manager.renderPosts(publicKey);
      } else if (view === 'replies') {
        manager.renderReplies(publicKey);
      } else if (view === 'likes') {
        manager.renderLikes(publicKey);
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }

      const item = e.target.closest('.profile-nav-item');

      if (!item || !root.contains(item)) {
        return;
      }

      e.preventDefault();
      item.click();
    });
  }

  /**
   * Reflect Manager's current view. Nothing is active on the global timeline.
   */
  syncActiveNav(mode = '') {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    const activeView =
      mode === 'posts' || mode === 'replies' || mode === 'likes' ? mode : '';

    root.querySelectorAll('.profile-nav-item').forEach((item) => {
      const view = item.getAttribute('data-profile-nav') || '';
      const active = Boolean(activeView) && view === activeView;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
}

module.exports = Profile;
