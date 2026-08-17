const ControlsTemplate = require('./controls.template');

class Controls {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.opts = null;
    this.raise_increment = 0;
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-controls')) {
      this.app.browser.addElementToSelector(ControlsTemplate(), '.texas-play');
    }
    if (!this.bound) {
      this.bindRaiseSheet();
      this.bound = true;
    }
  }

  bindRaiseSheet() {
    let range = document.getElementById('texas-raise-range');
    let cancel = document.getElementById('texas-raise-cancel');
    let confirm = document.getElementById('texas-raise-confirm');
    if (range) {
      range.oninput = () => {
        this.raise_increment = parseInt(range.value, 10);
        this.updateRaiseAmount();
      };
    }
    if (cancel) {
      cancel.onclick = () => this.closeRaiseSheet();
    }
    if (confirm) {
      confirm.onclick = () => this.confirmRaise();
    }
  }

  clear() {
    let host = document.getElementById('texas-controls');
    let row = document.getElementById('texas-control-row');
    if (row) {
      row.innerHTML = '';
    }
    if (host) {
      host.classList.remove('is-active');
    }
    let main = document.getElementById('texas-main');
    if (main) {
      main.classList.remove('is-your-move');
    }
    if (this.mod && typeof this.mod.updateControls === 'function') {
      this.mod.updateControls('', 1);
    }
    this.closeRaiseSheet();
  }

  showPrimary(opts) {
    this.render();
    this.opts = opts;
    let host = document.getElementById('texas-controls');
    let row = document.getElementById('texas-control-row');
    if (!row || !host) {
      return;
    }

    this.closeRaiseSheet();
    row.innerHTML = '';
    if (this.mod && typeof this.mod.updateControls === 'function') {
      this.mod.updateControls('', 1);
    }

    this.addArtifact(row, {
      action: 'fold',
      title: 'Fold',
      icon: '/texas/img/actions/fold.svg',
      onClick: () => this.fold()
    });

    if (opts.match_required > 0) {
      this.addArtifact(row, {
        action: 'call',
        title: 'Call',
        detail: this.mod.formatWager(opts.match_required, true),
        icon: '/texas/img/actions/call.svg',
        onClick: () => this.call()
      });
    } else {
      this.addArtifact(row, {
        action: 'check',
        title: 'Check',
        icon: '/texas/img/actions/call.svg',
        onClick: () => this.check()
      });
    }

    if (opts.can_raise) {
      this.addArtifact(row, {
        action: 'raise',
        title: 'Raise',
        icon: '/texas/img/actions/raise.svg',
        onClick: () => this.showRaise()
      });
    }

    host.classList.remove('is-active');
    let main = document.getElementById('texas-main');
    if (main) {
      main.classList.add('is-your-move');
    }
    requestAnimationFrame(() => {
      host.classList.add('is-active');
    });
  }

  addArtifact(row, spec) {
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'texas-artifact';
    btn.dataset.action = spec.action;
    btn.innerHTML = `<img class="texas-artifact-icon" src="${spec.icon}" alt="">
      <span class="texas-artifact-copy">
        <span class="texas-artifact-title">${spec.title}</span>
        ${spec.detail ? `<span class="texas-artifact-detail">${spec.detail}</span>` : ''}
      </span>`;
    btn.onclick = spec.onClick;
    row.appendChild(btn);
  }

  showRaise() {
    let opts = this.opts;
    let sheet = document.getElementById('texas-raise-sheet');
    let range = document.getElementById('texas-raise-range');
    let presets = document.getElementById('texas-raise-presets');
    if (!opts || !sheet || !range || !presets) {
      return;
    }

    this.raise_increment = opts.last_raise;
    range.min = String(opts.last_raise);
    range.max = String(opts.max_raise);
    range.step = '1';
    range.value = String(opts.last_raise);
    this.updateRaiseAmount();

    presets.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      let this_raise = opts.last_raise * 2 ** i;
      if (opts.max_raise > this_raise) {
        this.addPreset(presets, this_raise, this.mod.formatWager(this_raise, true));
      } else {
        break;
      }
    }
    this.addPreset(presets, opts.max_raise, 'All-in');

    sheet.hidden = false;
  }

  addPreset(host, increment, label) {
    let btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'texas-raise-preset';
    btn.innerHTML = label;
    btn.onclick = () => {
      this.raise_increment = increment;
      let range = document.getElementById('texas-raise-range');
      if (range) {
        range.value = String(increment);
      }
      this.updateRaiseAmount();
    };
    host.appendChild(btn);
  }

  updateRaiseAmount() {
    let el = document.getElementById('texas-raise-amount');
    if (!el || !this.opts) {
      return;
    }
    el.innerHTML = this.mod.formatWager(this.raise_increment, true);
  }

  closeRaiseSheet() {
    let sheet = document.getElementById('texas-raise-sheet');
    if (sheet) {
      sheet.hidden = true;
    }
  }

  confirmRaise() {
    let opts = this.opts;
    if (!opts) {
      return;
    }
    let amt = parseInt(this.raise_increment, 10);
    if (amt >= opts.last_raise && amt <= opts.max_raise) {
      this.closeRaiseSheet();
      this.raise(amt + opts.match_required);
    }
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
}

module.exports = Controls;
