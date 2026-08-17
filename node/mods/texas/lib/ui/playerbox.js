const PlayerboxTemplate = require('./playerbox.template');

class Playerbox {
  constructor(app, mod, publicKey = '', player_number = 0) {
    this.app = app;
    this.mod = mod;
    this.publicKey = publicKey;
    this.player_number = player_number;
    let character = this.resolveCharacter();
    this.character_id = character;
    this.character_src = `/texas/img/players/${character}.png`;
    this.name =
      player_number > 0 && mod.game?.state?.player_names
        ? mod.game.state.player_names[player_number - 1]
        : mod.app.keychain.returnUsername(publicKey);
    this.role = '';
    this.action = '';
    this.chips_html = '';
  }

  resolveCharacter() {
    if (this.player_number > 0 && typeof this.mod.ensurePlayerCharacters === 'function') {
      this.mod.ensurePlayerCharacters();
    }
    let chars = this.mod.game?.state?.player_characters;
    if (this.player_number > 0 && Array.isArray(chars) && chars[this.player_number - 1]) {
      return chars[this.player_number - 1];
    }
    // Observer / fallback seat: pick an unused portrait when possible.
    let pool =
      typeof this.mod.returnPlayerCharacterPool === 'function'
        ? this.mod.returnPlayerCharacterPool()
        : ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
    let used = new Set(Array.isArray(chars) ? chars : []);
    return pool.find((id) => !used.has(id)) || pool[0];
  }

  render(container) {
    if (document.querySelector(`.game-playerbox-${this.player_number}`)) {
      this.app.browser.replaceElementBySelector(
        PlayerboxTemplate(this),
        `.game-playerbox-${this.player_number}`
      );
    } else {
      this.app.browser.addElementToSelector(PlayerboxTemplate(this), container);
    }

    this.setRole(this.role);
  }

  remove() {
    let el = document.querySelector(`.game-playerbox-${this.player_number}`);
    if (el) {
      el.remove();
    }
  }

  addClass(classname, target = 'game-playerbox') {
    let el = document.querySelector(`.${target}-${this.player_number}`);
    if (el) {
      el.classList.add(classname);
    }
  }

  setRole(role) {
    this.role = role || '';
    let el = document.querySelector(`.game-playerbox-${this.player_number}`);
    if (!el) {
      return;
    }
    el.classList.remove('dealer', 'small-blind', 'big-blind', 'winner');
    delete el.dataset.blind;
    let text = String(this.role);
    if (text.includes('Winner')) {
      el.classList.add('winner');
    }
    if (text.includes('dealer')) {
      el.classList.add('dealer');
    }
    if (text.includes('small blind')) {
      el.classList.add('small-blind');
      el.dataset.blind = 'small';
    }
    if (text.includes('big blind')) {
      el.classList.add('big-blind');
      el.dataset.blind = 'big';
    }
  }

  setChips(html) {
    this.chips_html = html || '';
    let el = document.querySelector(`.game-playerbox-${this.player_number} .playerbox-chips`);
    if (el) {
      el.innerHTML = this.chips_html;
    }
  }

  setAction(action) {
    this.action = action || '';
    let el = document.querySelector(`.game-playerbox-${this.player_number} .playerbox-action`);
    if (el) {
      el.innerHTML = this.action;
    }
  }

  updateUserline(userline) {
    this.setRole(userline);
  }

  updateIcons(content) {
    this.setChips(content);
  }

  updateBody(content) {
    this.setAction(this.strip(content));
  }

  updateGraphics(content) {
    let el = document.querySelector(`.game-playerbox-graphics-${this.player_number}`);
    if (el) {
      el.innerHTML = content;
    }
  }

  replaceGraphics(content, selector) {
    let pb_selector = `.game-playerbox-graphics-${this.player_number}`;
    if (document.querySelector(pb_selector)) {
      if (document.querySelector(`${pb_selector} ${selector}`)) {
        this.app.browser.replaceElementBySelector(content, `${pb_selector} ${selector}`);
      } else {
        this.app.browser.addElementToSelector(content, pb_selector);
      }
    }
    return `${pb_selector} ${selector}`;
  }

  strip(html) {
    if (!html) {
      return '';
    }
    return String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = Playerbox;
