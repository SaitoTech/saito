const MainTemplate = require('./main.template');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  hasGetSaito() {
    try {
      return !!this.app.modules.returnModule('BuySaito')?.purchase_overlay;
    } catch (err) {
      return false;
    }
  }

  render(data = {}) {
    const inactive = data.inactive === true || !this.hasGetSaito();

    const root = document.querySelector('.faucet-home');
    if (!root) {
      this.app.browser.addElementToDom(MainTemplate(this.app, this.mod, { inactive }));
      this.attachEvents();
      return;
    }

    const btn = root.querySelector('.saito-button-primary');
    const msg = root.querySelector('.inactive-message');
    if (btn) {
      btn.hidden = inactive;
    }
    if (msg) {
      msg.hidden = !inactive;
    }
  }

  attachEvents() {
    const btn = document.querySelector('.faucet-home .saito-button-primary');
    if (!btn) {
      return;
    }
    btn.onclick = () => {
      if (!this.hasGetSaito()) {
        this.render({ inactive: true });
        return;
      }
      this.app.connection.emit('saito-purchase-launch');
    };
  }
}

module.exports = Main;
