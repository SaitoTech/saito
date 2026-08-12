const NavTemplate = require('./nav.template');

class ArcadeNav {
  constructor(app, mod, container = '.arcade-nav') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    let root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.innerHTML = NavTemplate(this);
    this.attachEvents();
  }

  setActive(activeItem) {
    let root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    root.querySelectorAll('.item').forEach((item) => {
      item.classList.toggle('active', item === activeItem);
    });
  }

  attachEvents() {
    let root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    let home = root.querySelector('[data-nav="home"]');
    let settings = root.querySelector('[data-nav="settings"]');

    if (home) {
      home.onclick = (e) => {
        e.preventDefault();
        let anchor = document.getElementById('top-of-game-list');
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        this.setActive(home);
      };
    }

    if (settings) {
      settings.onclick = (e) => {
        e.preventDefault();
        this.setActive(settings);
        if (this.mod?.settings_overlay) {
          this.mod.settings_overlay.render();
        }
      };
    }
  }
}

module.exports = ArcadeNav;
