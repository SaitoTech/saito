const ControlsTemplate = require('./controls.template');

class Controls {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.opts = null;
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-controls')) {
      this.app.browser.addElementToSelector(ControlsTemplate(), '.texas-table');
    }
  }

  clear() {
    let row = document.getElementById('texas-control-row');
    if (row) {
      row.innerHTML = '';
    }
  }

  showPrimary(opts) {
    this.render();
    this.opts = opts;
    let row = document.getElementById('texas-control-row');
    if (!row) {
      return;
    }
    row.innerHTML = '';

    this.addControl(row, 'Fold', () => this.fold(), 'fold');

    if (opts.match_required > 0) {
      this.addControl(
        row,
        `Call ${this.mod.formatWager(opts.match_required, false)}`,
        () => this.call(),
        'call'
      );
    } else {
      this.addControl(row, 'Check', () => this.check(), 'check');
    }

    if (opts.can_raise) {
      this.addControl(row, 'Raise', () => this.showRaise(), 'raise');
    }
  }

  showRaise() {
    let opts = this.opts;
    let row = document.getElementById('texas-control-row');
    if (!row || !opts) {
      return;
    }
    row.innerHTML = '';

    this.addControl(row, 'Back', () => this.showPrimary(opts), 'back');

    for (let i = 0; i < 3; i++) {
      let this_raise = opts.last_raise * 2 ** i;
      if (opts.max_raise > this_raise) {
        this.addControl(
          row,
          this.mod.formatWager(this_raise, false),
          () => this.raise(this_raise + opts.match_required),
          'raise-amount'
        );
      } else {
        break;
      }
    }

    this.addControl(row, 'Custom', () => this.enterRaise(), 'raise-manual');
    this.addControl(
      row,
      'All-in',
      () => this.raise(opts.max_raise + opts.match_required),
      'all-in'
    );
  }

  addControl(row, html, fn, action = '') {
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'texas-control';
    if (action) {
      btn.dataset.action = action;
    }
    btn.innerHTML = html;
    btn.onclick = fn;
    row.appendChild(btn);
  }

  async fold() {
    if (this.opts && !this.opts.match_required) {
      let c = await sconfirm('Are you sure you want to fold?');
      if (!c) {
        this.showPrimary(this.opts);
        return;
      }
    }
    this.mod.addMove(`fold\t${this.mod.game.player}`);
    this.mod.endTurn();
  }

  check() {
    this.mod.addMove(`check\t${this.mod.game.player}`);
    this.mod.endTurn();
  }

  call() {
    this.mod.addMove(`call\t${this.mod.game.player}`);
    this.mod.endTurn();
  }

  raise(total) {
    this.mod.addMove(`raise\t${this.mod.game.player}\t${total}`);
    this.mod.endTurn();
  }

  async enterRaise() {
    let opts = this.opts;
    let c = await sprompt('How many chips would you like to raise?');
    if (!c) {
      return;
    }
    let amt = parseInt(c);
    if (amt >= opts.last_raise && amt <= opts.max_raise) {
      this.raise(amt + opts.match_required);
    } else {
      await sconfirm('Invalid input');
      this.enterRaise();
    }
  }
}

module.exports = Controls;
