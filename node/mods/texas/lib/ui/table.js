const TableTemplate = require('./table.template');
const Board = require('./board');
const Hand = require('./hand');
const Controls = require('./controls');
const Result = require('./result');

class Table {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.board = new Board(app, mod);
    this.hand = new Hand(app, mod);
    this.controls = new Controls(app, mod);
    this.result = new Result(app, mod);
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-table')) {
      this.app.browser.addElementToSelector(TableTemplate(), '.texas-main');
    }

    this.board.render();
    this.hand.render();
    this.controls.render();
    this.result.render();
  }
}

module.exports = Table;
