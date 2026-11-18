const MainTemplate = require('./main.template');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  page_root() {
    let container = document.getElementById('saito-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'saito-container';
      container.className = 'saito-container gamebot-page';
      document.body.appendChild(container);
    }
    container.classList.add('gamebot-page');
    let main = container.querySelector('.saito-main');
    if (!main) {
      main = document.createElement('div');
      main.className = 'saito-main';
      container.appendChild(main);
    }
    return main;
  }

  render() {
    const manager = this.mod.manager;
    const html = manager.phase === 'loading' ? MainTemplate.loading() : MainTemplate(manager.notice || '');
    const root = this.page_root();
    const existing = root.querySelector('.gamebot-screen');
    if (existing) {
      existing.outerHTML = html;
    } else {
      root.insertAdjacentHTML('beforeend', html);
    }
    if (manager.phase !== 'loading') {
      this.attachEvents();
    }
  }

  attachEvents() {
    const accept = document.querySelector('.gamebot-accept');
    if (accept) {
      accept.onsubmit = async (event) => {
        event.preventDefault();
        const field = accept.querySelector('[name="invite_link"]');
        this.mod.manager.phase = 'loading';
        this.mod.manager.notice = '';
        this.render();
        try {
          const game_id = await this.mod.manager.accept_game(field.value);
          this.open_page(game_id);
        } catch (err) {
          this.mod.manager.phase = 'splash';
          this.mod.manager.notice = err.message || 'Could not accept that invitation';
          this.render();
        }
      };
    }

    const open = document.querySelector('.gamebot-open');
    if (open) {
      open.onsubmit = async (event) => {
        event.preventDefault();
        const field = open.querySelector('[name="game_id"]');
        const value = field.value;
        this.mod.manager.phase = 'loading';
        this.mod.manager.notice = '';
        this.render();
        try {
          const game_id = await this.mod.manager.open_game(value);
          this.open_page(game_id);
        } catch (err) {
          this.mod.manager.phase = 'splash';
          this.mod.manager.notice = err.message || 'Could not open that game';
          this.render();
        }
      };
    }
  }

  open_page(game_id) {
    this.mod.manager.phase = 'game';
    if (typeof this.mod.manager.set_game_hash === 'function') {
      this.mod.manager.set_game_hash(game_id);
    } else if (typeof window !== 'undefined' && window.location) {
      window.location.hash = 'gid=' + encodeURIComponent(game_id);
    }
    document.querySelector('.gamebot-screen')?.remove();
    if (this.mod.game_page && typeof this.mod.game_page.mount === 'function') {
      this.mod.game_page.mount();
    }
  }
}

module.exports = Main;
