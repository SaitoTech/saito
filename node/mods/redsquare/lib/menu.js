const MenuTemplate = require('./menu.template');

class Menu {
  constructor(app, mod, container = '', composer = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.composer = composer;

    this.user = {
      name: 'Your Name',
      handle: 'you',
      avatar: '/saito/img/dreamscape.png'
    };
    this.notification_count = 3;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(MenuTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {
    let postBtn = document.querySelector(`${this.container} .menu-post`);
    if (!postBtn || postBtn.dataset.bound) {
      return;
    }

    postBtn.dataset.bound = '1';
    postBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.composer) {
        this.composer.open();
      }
    });
  }
}

module.exports = Menu;
