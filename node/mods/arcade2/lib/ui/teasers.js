const ArcadeTeasersTemplate = require('./teasers.template');

class ArcadeTeasers {
  constructor(app, mod, container) {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    const el = document.querySelector(this.container);
    if (el) {
      el.innerHTML = ArcadeTeasersTemplate(this.app, this.mod);
    }
  }
}

module.exports = ArcadeTeasers;
