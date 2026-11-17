const GameTemplate = require('./game.template');

class GamePage {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.game_id = '';
  }

  async render() {
    const raw = String(window.location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(raw);
    let game_id = params.get('gid') || '';
    try {
      game_id = decodeURIComponent(game_id);
    } catch (err) {}
    this.game_id = game_id;

    const html = GameTemplate();
    const existing = document.querySelector('.gamebot-container');
    if (existing) {
      existing.outerHTML = html;
    } else {
      this.app.browser.addElementToDom(html);
    }

    const back = document.querySelector('.gamebot-back');
    if (back) {
      back.onclick = () => {
        window.location.hash = '';
        this.mod.render();
      };
    }

    const form = document.querySelector('.gamebot-manual');
    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const field = form.querySelector('[name="instruction"]');
        const instruction = field.value;
        field.value = '';
        try {
          await this.mod.manager.receive_manual_input(this.game_id, instruction);
          this.notice('');
        } catch (err) {
          this.notice(err.message || 'That instruction failed');
        }
      };
    }

    this.mod.manager.on_context = (id) => {
      if (id === this.game_id) {
        this.draw_context();
      }
    };

    const frame = document.querySelector('.gamebot-game-frame');
    if (frame) {
      frame.onload = () => {
        if (this.game_id === game_id) {
          this.mod.manager.examine_game_move(game_id).catch((err) => {
            this.notice(err.message || 'Could not examine the game');
          });
        }
      };
    }

    try {
      await this.mod.manager.examine_game_move(game_id);
    } catch (err) {
      this.notice(err.message || 'Could not examine the game');
    }
    this.show_game();
    this.draw_context();
  }

  show_game() {
    const frame = document.querySelector('.gamebot-game-frame');
    const view = this.mod.manager.view;
    if (!frame || !view?.slug) {
      return;
    }
    const src = '/' + view.slug + '/#gid=' + encodeURIComponent(view.game_id);
    if (frame.getAttribute('src') !== src) {
      frame.setAttribute('src', src);
    }
  }

  draw_context() {
    const view = this.mod.manager.view;
    const context_el = document.querySelector('.gamebot-context');
    const clickable_el = document.querySelector('.gamebot-clickable');
    if (context_el) {
      if (view?.context_error) {
        context_el.textContent = view.context_error;
      } else {
        try {
          context_el.textContent = JSON.stringify(view?.context ?? null, null, 2);
        } catch (err) {
          context_el.textContent = err.message || 'Context could not be shown';
        }
      }
    }
    if (clickable_el) {
      try {
        clickable_el.textContent = JSON.stringify(view?.clickable_items ?? [], null, 2);
      } catch (err) {
        clickable_el.textContent = err.message || 'Clickable items could not be shown';
      }
    }
    this.draw_clickable_actions(view?.clickable_items || []);
    this.draw_manual();
  }

  draw_clickable_actions(items) {
    const list = document.querySelector('.gamebot-clickable-actions');
    if (!list) {
      return;
    }
    list.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'saito-button-secondary';
      button.textContent = item.identifier;
      button.onclick = () => {
        this.execute_item(item.identifier);
      };
      list.append(button);
    }
  }

  async execute_item(identifier) {
    this.notice('Running ' + identifier);
    try {
      await this.mod.manager.execute_clickable_item(this.game_id, identifier);
      this.notice('');
    } catch (err) {
      this.notice(err.message || 'That control could not be used');
    }
  }

  draw_manual() {
    const el = document.querySelector('.gamebot-manual-result');
    const manual = this.mod.manager.manual;
    if (!el || !manual || manual.game_id !== this.game_id) {
      return;
    }
    el.textContent = manual.input + ' — ' + manual.response;
  }

  notice(text) {
    const el = document.querySelector('.gamebot-notice');
    if (el) {
      el.textContent = text || '';
    }
  }
}

module.exports = GamePage;
