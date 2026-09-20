const Template = require('./planets.template');

class FactionSheetPlanets {
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

module.exports = FactionSheetPlanets;
