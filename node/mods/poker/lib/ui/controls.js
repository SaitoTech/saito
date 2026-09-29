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

    if (!document.querySelector('.poker-controls')) {
      this.app.browser.addElementToSelector(ControlsTemplate(), '.poker-play');
    }
    if (!this.bound) {
      this.bindRaiseSheet();
      this.bound = true;
    }
  }

  bindRaiseSheet() {
    let range = document.getElementById('poker-raise-range');
    let cancel = document.getElementById('poker-raise-cancel');
    let confirm = document.getElementById('poker-raise-confirm');
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
    let host = document.getElementById('poker-controls');
    let row = document.getElementById('poker-control-row');
    if (row) {
      row.innerHTML = '';
    }
    if (host) {
      host.classList.remove('is-active');
    }
    let main = document.getElementById('poker-main');
    if (main) {
      main.classList.remove('is-your-move');
    }
    if (this.mod?.result) {
      this.mod.result.clearAcknowledge();
      this.mod.result.hide();
    }
    this.closeRaiseSheet();
  }

  showPrimary(opts) {
    this.render();
    this.opts = opts;
    let host = document.getElementById('poker-controls');
    let row = document.getElementById('poker-control-row');
    if (!row || !host) {
      return;
    }

    this.closeRaiseSheet();
    row.innerHTML = '';
    if (this.mod?.result) {
      this.mod.result.clearAcknowledge();
    }

    this.addArtifact(row, {
      action: 'fold',
      title: 'Fold',
      icon: '/poker/img/actions/fold.svg',
      onClick: () => this.fold()
    });

    if (opts.match_required > 0) {
      this.addArtifact(row, {
        action: 'call',
        title: 'Call',
        detail: this.mod.formatWager(opts.match_required, true),
        icon: '/poker/img/actions/call.svg',
        onClick: () => this.call()
      });
    } else {
      this.addArtifact(row, {
        action: 'check',
        title: 'Check',
        icon: '/poker/img/actions/call.svg',
        onClick: () => this.check()
      });
    }

    if (opts.can_raise) {
      this.addArtifact(row, {
        action: 'raise',
        title: 'Raise',
        icon: '/poker/img/actions/raise.svg',
        onClick: () => this.showRaise()
      });
    }

    host.classList.remove('is-active');
    let main = document.getElementById('poker-main');
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
    btn.className = 'poker-artifact';
    btn.dataset.action = spec.action;
    btn.innerHTML = `<img class="poker-artifact-icon" src="${spec.icon}" alt="">
      <span class="poker-artifact-copy">
        <span class="poker-artifact-title">${spec.title}</span>
        ${spec.detail ? `<span class="poker-artifact-detail">${spec.detail}</span>` : ''}
      </span>`;
    btn.onclick = spec.onClick;
    row.appendChild(btn);
  }

  showRaise() {
    let opts = this.opts;
    let sheet = document.getElementById('poker-raise-sheet');
    let range = document.getElementById('poker-raise-range');
    let presets = document.getElementById('poker-raise-presets');
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
    btn.className = 'poker-raise-preset';
    btn.innerHTML = label;
    btn.onclick = () => {
      this.raise_increment = increment;
      let range = document.getElementById('poker-raise-range');
      if (range) {
        range.value = String(increment);
      }
      this.updateRaiseAmount();
    };
    host.appendChild(btn);
  }

  updateRaiseAmount() {
    let el = document.getElementById('poker-raise-amount');
    if (!el || !this.opts) {
      return;
    }
    el.innerHTML = this.mod.formatWager(this.raise_increment, true);
  }

  closeRaiseSheet() {
    let sheet = document.getElementById('poker-raise-sheet');
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
