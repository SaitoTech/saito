class BrowserDom {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.limitation =
      'This browser does not run the game board. A full node runs that work.';
  }

  watch() {}

  interactions() {
    return [];
  }

  mount(gameMod, container) {
    if (container) {
      container.textContent = this.limitation;
    }
    return null;
  }

  paint() {}

  async execute() {
    throw new Error('This browser does not run game actions. A full node runs that work.');
  }
}

module.exports = BrowserDom;
