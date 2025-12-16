const Tutorial03MainTemplate = require('./main.template');

class Tutorial03Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render() {
    this.app.browser.addElementToDom(Tutorial03MainTemplate());
    this.attachEvents();
  }

  attachEvents() {
    let btn = document.querySelector('.tutorial03-button');
    if (btn) {
      btn.onclick = (e) => {
        this.mod.sendTutorial03Transaction();
      };
    }
  }

  receiveTransaction(tx) {
    let txmsg = tx.returnMessage();
    this.app.browser.addElementToSelector(
      `<div>TX received - random: ${txmsg.data.random}</div>`,
      `.tutorial03-received-transactions`
    );
  }
}

module.exports = Tutorial03Main;
