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
    this.drawGames();
    this.attachEvents();
  }

  drawGames() {
    const list = document.querySelector('.gamebot-game-list');
    if (!list) {
      return;
    }
    list.replaceChildren();
    const games = this.mod.manager.records();
    if (!games.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No games yet.';
      list.append(empty);
      return;
    }

    for (const game of games) {
      const row = document.createElement('article');
      row.className = 'gamebot-game-row';

      const title = document.createElement('div');
      title.className = 'gamebot-game-title';
      title.textContent = game.module || 'Game';

      const meta = document.createElement('div');
      meta.className = 'gamebot-game-meta';
      meta.textContent = game.status + ' · ' + shortId(game.id);

      const actions = document.createElement('div');
      actions.className = 'gamebot-game-actions';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'saito-button-primary';
      open.textContent = 'Open';
      open.onclick = () => {
        window.location.hash = 'gid=' + encodeURIComponent(game.id);
      };

      actions.append(open);
      if (game.status === 'joining') {
        actions.append(this.actionButton('Cancel', () => this.mod.manager.cancel(game.id)));
      }
      if (game.status === 'active') {
        actions.append(this.actionButton('Forfeit', () => this.mod.manager.forfeit(game.id)));
      }

      row.append(title, meta, actions);
      list.append(row);
    }
  }

  actionButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saito-button-secondary';
    button.textContent = label;
    button.onclick = async () => {
      const confirmed = await confirmChoice(label + ' this game?');
      if (!confirmed) {
        return;
      }
      try {
        await action();
        this.render();
      } catch (err) {
        this.notice(err.message || 'That action failed');
      }
    };
    return button;
  }

  attachEvents() {
    const form = document.querySelector('.gamebot-accept');
    if (!form || form.dataset.bound) {
      return;
    }
    form.dataset.bound = '1';
    form.onsubmit = async (event) => {
      event.preventDefault();
      const field = form.querySelector('[name="invitation"]');
      this.notice('Accepting invitation...');
      try {
        await this.mod.manager.acceptInvitation(field.value);
        field.value = '';
        this.notice('');
        this.render();
      } catch (err) {
        this.notice(err.message || 'Could not accept that invitation');
      }
    };
  }

  notice(text) {
    const el = document.querySelector('.gamebot-notice');
    if (el) {
      el.textContent = text || '';
    }
  }
}

function shortId(id) {
  const value = String(id || '');
  if (value.length <= 18) {
    return value;
  }
  return value.slice(0, 8) + '…' + value.slice(-6);
}

async function confirmChoice(message) {
  if (typeof sconfirm === 'function') {
    return sconfirm(message);
  }
  return true;
}

module.exports = Main;
