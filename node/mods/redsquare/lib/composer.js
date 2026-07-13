const SaitoOverlay = require('../../../lib/saito/ui/saito-overlay/saito-overlay');
const ComposerTemplate = require('./composer.template');

class Composer {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);

    this.placeholder = 'What is happening?';
    this.avatar = '/saito/img/dreamscape.png';
  }

  open() {
    if (this.mod.profile?.avatar) {
      this.avatar = this.mod.profile.avatar;
    }

    this.overlay.show(ComposerTemplate(this));
    this.attachEvents();

    setTimeout(() => {
      let input = document.querySelector('.saito-overlay .composer-input');
      if (input) {
        input.focus();
      }
    }, 50);
  }

  close() {
    this.overlay.close();
  }

  attachEvents() {}
}

module.exports = Composer;
