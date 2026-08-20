const SidebarTemplate = require('./sidebar.template');
const Pot = require('./pot');
const Playerbox = require('./playerbox');

class Sidebar {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.pot = new Pot(app, mod);
    this.playerboxes = [];
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-sidebar')) {
      this.app.browser.addElementToSelector(SidebarTemplate(), '.texas-main');
    }

    this.pot.render();
    this.renderPlayerboxes();
    this.bindBalanceToggle();
  }

  /**
   * Touch / keyboard: toggle chip ↔ crypto on the balance line only.
   * Mouse uses CSS :hover. Does not change game logic.
   */
  bindBalanceToggle() {
    if (this._balanceToggleBound) {
      return;
    }
    const sidebar = document.querySelector('.texas-sidebar');
    if (!sidebar) {
      return;
    }

    const activate = (el) => {
      if (!el?.classList.contains('playerbox-balance--toggle')) {
        return;
      }
      el.classList.toggle('is-showing-crypto');
      const showing = el.classList.contains('is-showing-crypto');
      el.setAttribute('aria-pressed', showing ? 'true' : 'false');
      const cryptoFace = el.querySelector('.playerbox-balance-face--crypto');
      if (cryptoFace) {
        cryptoFace.setAttribute('aria-hidden', showing ? 'false' : 'true');
      }
    };

    sidebar.addEventListener(
      'click',
      (e) => {
        const bal = e.target.closest('.playerbox-balance--toggle');
        if (!bal || !sidebar.contains(bal)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        activate(bal);
      },
      true
    );

    sidebar.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }
      const bal = e.target.closest?.('.playerbox-balance--toggle');
      if (!bal || !sidebar.contains(bal)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      activate(bal);
    });

    this._balanceToggleBound = true;
  }

  renderPlayerboxes() {
    let n = this.mod.game?.players?.length || 0;

    while (this.playerboxes.length < n) {
      let i = this.playerboxes.length;
      this.playerboxes.push(
        new Playerbox(this.app, this.mod, this.mod.game.players[i], i + 1)
      );
    }

    if (
      n > 0 &&
      !this.mod.game.players.includes(this.mod.publicKey) &&
      this.playerboxes.length == n
    ) {
      this.playerboxes.push(new Playerbox(this.app, this.mod, this.mod.publicKey, 0));
    }

    for (let i = 0; i < this.playerboxes.length; i++) {
      this.playerboxes[i].render('.texas-sidebar');
    }
  }

  returnBox(player_number) {
    if (player_number == 0) {
      return this.playerboxes.find((box) => box.player_number == 0) || null;
    }
    if (player_number > 0 && this.playerboxes.length >= player_number) {
      return this.playerboxes[player_number - 1];
    }
    return null;
  }

  addClass(content, player_number, target = 'game-playerbox') {
    this.returnBox(player_number)?.addClass(content, target);
  }

  setAction(action, player_number) {
    this.returnBox(player_number)?.setAction(action);
  }

  setChips(html, player_number) {
    this.returnBox(player_number)?.setChips(html);
  }

  setRole(role, player_number) {
    this.returnBox(player_number)?.setRole(role);
  }

  updateBody(content, player_number) {
    this.returnBox(player_number)?.updateBody(content);
  }

  updateGraphics(content, player_number) {
    this.returnBox(player_number)?.updateGraphics(content);
  }

  replaceGraphics(content, selector, player_number) {
    return this.returnBox(player_number)?.replaceGraphics(content, selector) ?? null;
  }

  updateUserline(userline, player_number) {
    this.returnBox(player_number)?.updateUserline(userline);
  }

  updateIcons(content, player_number) {
    this.returnBox(player_number)?.updateIcons(content);
  }

  setActive(player_number, deactivate_others = true) {
    if (deactivate_others) {
      document.querySelectorAll('.texas-playerbox.active').forEach((el) => {
        el.classList.remove('active');
      });
    }
    let obj = document.querySelector(`.game-playerbox-${player_number}`);
    if (obj) {
      obj.classList.add('active');
    }
  }

  setInactive(player_number = -1) {
    if (player_number == -1) {
      this.setActive(-1);
      return;
    }
    let obj = document.querySelector(`.game-playerbox-${player_number}`);
    if (obj) {
      obj.classList.remove('active');
    }
  }

  removeBoxes() {
    for (let box of this.playerboxes) {
      box.remove();
    }
    this.playerboxes = [];
  }
}

module.exports = Sidebar;
