/**
 * One Arcade game tile.
 * Holds a Game and renders it. Click → this.game.onClick().
 */
class Teaser {
  constructor(app, arcade, game = null, opts = {}) {
    this.app = app;
    this.arcade = arcade;
    this.game = game;
    this.is_add_game = !!opts.is_add_game;
    this.el = null;
  }

  returnClassList() {
    let classes = ['teaser'];
    if (this.is_add_game) {
      classes.push('add');
    } else if (this.game?.game_mod?.teaser === true || this.game?.game_mod?.is_teaser === true) {
      classes.push('install');
    }
    return classes.join(' ');
  }

  renderHTML() {
    if (this.is_add_game) {
      return `
        <div role="button" tabindex="0" class="${this.returnClassList()}" aria-label="Add Game">
          <div class="art" aria-hidden="true"></div>
          <div class="title"><span>+ Add Game</span></div>
          <div class="footer"></div>
        </div>
      `;
    }

    let title = this.game?.title || '';
    let image = this.game?.image || '';
    let name = this.game?.name || '';
    let league_id = this.game?.league_id || '';
    let art_style = image ? ` style="background-image: url('${image}')"` : '';

    return `
      <div role="button" tabindex="0"
        class="${this.returnClassList()}"
        data-id="${name}"
        data-league="${league_id}">
        <div class="art"${art_style} aria-hidden="true"></div>
        <div class="title"><span>${title}</span></div>
        <div class="footer"></div>
      </div>
    `;
  }

  bind(el) {
    this.el = el;
    if (!this.el) {
      return;
    }

    const activate = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.onClick();
    };

    this.el.onclick = activate;
    this.el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        activate(e);
      }
    };
  }

  async onClick() {
    if (this.is_add_game) {
      this.app.connection.emit('arcade-add-game');
      return;
    }
    if (this.game && typeof this.game.onClick === 'function') {
      await this.game.onClick();
    }
  }
}

module.exports = Teaser;
