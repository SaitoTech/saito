const TokensTemplate = require('./tokens.template');

class AdminTokensUI {
  constructor(app, mod, container = '.admin-tokens') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(TokensTemplate(), this.container);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelectorAll(`${this.container} .admin-copy-cmd`).forEach((btn) => {
      btn.onclick = () => {
        const value = btn.dataset.cmd;
        if (!value) {
          return;
        }
        navigator.clipboard.writeText(value).then(() => {
          if (typeof siteMessage === 'function') {
            siteMessage('copied to clipboard...', 2000);
          }
        });
      };
    });
  }
}

module.exports = AdminTokensUI;
