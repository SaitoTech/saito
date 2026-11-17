const MainTemplate = require('./main.template');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render() {
    const html = MainTemplate();
    const existing = document.querySelector('.gamebot-container');
    if (existing) {
      existing.outerHTML = html;
    } else {
      this.app.browser.addElementToDom(html);
    }
    this.attachEvents();
  }

  attachEvents() {
    const accept = document.querySelector('.gamebot-accept');
    if (accept) {
      accept.onsubmit = async (event) => {
        event.preventDefault();
        const field = accept.querySelector('[name="invite_link"]');
        this.notice('Accepting invitation...');
        try {
          const game_id = await this.mod.manager.accept_game(field.value);
          this.open_page(game_id);
        } catch (err) {
          this.notice(err.message || 'Could not accept that invitation');
        }
      };
    }

    const open = document.querySelector('.gamebot-open');
    if (open) {
      open.onsubmit = async (event) => {
        event.preventDefault();
        const field = open.querySelector('[name="game_id"]');
        try {
          const game_id = await this.mod.manager.open_game(field.value);
          this.open_page(game_id);
        } catch (err) {
          this.notice(err.message || 'Could not open that game');
        }
      };
    }
  }

  open_page(game_id) {
    window.location.hash = 'gid=' + encodeURIComponent(game_id);
    if (this.mod.browser_active && typeof this.mod.render === 'function') {
      this.mod.render();
    }
  }

  notice(text) {
    const el = document.querySelector('.gamebot-notice');
    if (el) {
      el.textContent = text || '';
    }
  }
}

module.exports = Main;
