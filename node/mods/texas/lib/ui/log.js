class Log {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }

    if (!document.querySelector('.texas-log')) {
      this.app.browser.addElementToSelector(
        '<div class="texas-log" id="texas-log"></div>',
        '.texas-main'
      );
    }

    this.mod.log.render();

    let host = document.querySelector('.texas-log');
    let wrap = document.getElementById('log-wrapper');
    if (host && wrap && wrap.parentElement !== host) {
      host.appendChild(wrap);
    }
  }
}

module.exports = Log;
