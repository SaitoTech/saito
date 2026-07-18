const NewPostTemplate = require('./new-post.template');

class NewPost {
  constructor(app, mod, container = '.actions') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    const slot = document.querySelector(this.container);

    if (!slot) {
      return;
    }

    // Shell usually ships the button; inject only if the slot is empty.
    if (!slot.querySelector('.new-post')) {
      this.app.browser.replaceElementContentBySelector(NewPostTemplate(this), this.container);
    }

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root || root.dataset.newPostBound) {
      return;
    }

    root.dataset.newPostBound = '1';

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.new-post');

      if (!btn || !root.contains(btn)) {
        return;
      }

      e.preventDefault();
      this.mod.compose_overlay?.open();
    });
  }
}

module.exports = NewPost;
