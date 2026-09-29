const UpdateDescriptionTemplate = require('./update-description.template');
const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoLoader = require('../../../../lib/saito/ui/saito-loader/saito-loader');

class UpdateDescription {
  constructor(app, mod, key = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.loader = new SaitoLoader(this.app, this.mod, '.saito-overlay-form');
    this.key = key;
  }

  render(description) {
    this.overlay.show(UpdateDescriptionTemplate());
    const inputBox = document.getElementById('saito-overlay-form-input');
    if (inputBox) {
      inputBox.value = description || '';
    }
    this.attachEvents();
  }

  attachEvents() {
    const inputBox = document.getElementById('saito-overlay-form-input');
    if (!inputBox) {
      return;
    }

    inputBox.select();

    const submit = document.querySelector('.saito-overlay-form-submit');
    if (!submit) {
      return;
    }

    submit.onclick = (e) => {
      e.preventDefault();

      const description = inputBox.value;

      this.mod.sendProfileTransaction({ description }, this.key);
      this.overlay.remove();
    };
  }
}

module.exports = UpdateDescription;
