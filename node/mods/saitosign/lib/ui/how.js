const HowTemplate = require('./how.template');

class How {
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
    this.app.browser.replaceElementContentBySelector(HowTemplate(), '.saito-container');

    const back = document.querySelector('.how [data-back]');
    if (back) {
      back.onclick = () => this.main.showSplash();
    }
  }
}

module.exports = How;
