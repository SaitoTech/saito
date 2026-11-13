class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render() {
    this.attachEvents();
  }

  attachEvents() {
    this.mod.purchase_overlay?.renderAmountPage();

    const button = document.getElementById('mixin-buysaito-launch');
    if (button) {
      button.onclick = (e) => {
        e.preventDefault();
        this.app.connection.emit('saito-purchase-launch');
      };
    }
  }
}

module.exports = Main;
