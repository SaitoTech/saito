const MainTemplate = require('./main.template');
const Form = require('./form');
const CardUI = require('./card');
const MyCardsOverlay = require('./overlays/my-cards');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.view = 'home';
    this.card_ui = new CardUI(app, mod);
    this.form = new Form(app, mod, this.card_ui);
    this.my_cards = new MyCardsOverlay(app, mod);
  }

  render(view = this.view) {
    const container = document.querySelector('#saito-container');
    if (!container) {
      return;
    }

    this.view = view === 'generator' ? 'generator' : 'home';
    container.classList.add('tscardgen-page');
    this.app.browser.replaceElementContentBySelector(MainTemplate(this.view), '#saito-container');

    if (this.view === 'generator') {
      this.form.render();
      this.card_ui.render();
      return;
    }

    this.attachHomeEvents();
  }

  showHome() {
    this.render('home');
  }

  showGenerator() {
    this.render('generator');
  }

  attachHomeEvents() {
    const createBtn = document.getElementById('tscardgen-create-btn');
    if (createBtn) {
      createBtn.onclick = (e) => {
        e.preventDefault();
        this.showGenerator();
      };
    }

    const myCardsBtn = document.getElementById('tscardgen-my-cards-btn');
    if (myCardsBtn) {
      myCardsBtn.onclick = (e) => {
        e.preventDefault();
        this.my_cards.render();
      };
    }
  }
}

module.exports = Main;
