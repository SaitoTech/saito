const NewPostTemplate = require('./new-post.template');

class NewPost {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(NewPostTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root || root.dataset.newPostBound) {
      return;
    }

    root.dataset.newPostBound = '1';

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.new-post-button');

      if (!btn || !root.contains(btn)) {
        return;
      }

      e.preventDefault();
      this.mod.compose_overlay?.open();
    });
  }
}

module.exports = NewPost;
