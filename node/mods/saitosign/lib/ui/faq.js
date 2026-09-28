const FaqTemplate = require('./faq.template');

class Faq {
  constructor(app, mod, main) {
    this.app = app;
    this.mod = mod;
    this.main = main;
  }

  render() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }

    container.classList.add('saitosign');
    this.app.browser.replaceElementContentBySelector(FaqTemplate(), '.saito-container');

    const back = document.querySelector('.faq [data-back]');
    if (back) {
      back.onclick = () => this.main.showSplash();
    }
  }
}

module.exports = Faq;
