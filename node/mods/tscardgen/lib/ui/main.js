const MainTemplate = require('./main.template');
const Form = require('./form');
const CardUI = require('./card');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.card_ui = new CardUI(app, mod);
    this.form = new Form(app, mod, this.card_ui);
  }

  render() {
    const container = document.querySelector('#saito-container');
    if (!container) {
      return;
    }

    container.classList.add('tscardgen-page');
    this.app.browser.replaceElementContentBySelector(MainTemplate(), '#saito-container');
    this.form.render();
    this.card_ui.render();
  }
}

module.exports = Main;
