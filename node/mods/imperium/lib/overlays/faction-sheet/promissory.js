const Template = require('./promissory.template');

class FactionSheetPromissory {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render(player) {
    let el = document.querySelector('.faction-sheet-body');
    if (!el) {
      return;
    }
    el.innerHTML = Template(this.mod, player);
  }
}

module.exports = FactionSheetPromissory;
