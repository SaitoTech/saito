const ComposerTemplate = require('./composer.template');

class Composer {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.placeholder = 'What is happening?';
    this.avatar = '/saito/img/dreamscape.png';
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(ComposerTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Composer;
