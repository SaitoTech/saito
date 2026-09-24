const SplashTemplate = require('./splash.template');

class Splash {
  constructor(app, mod, main) {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.notice = '';
  }

  render() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }

    container.classList.add('saitosign');
    this.app.browser.replaceElementContentBySelector(
      SplashTemplate({ notice: this.notice }),
      '.saito-container'
    );
    this.attachEvents();
  }

  fileInput() {
    if (this.input) {
      return this.input;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf,.saito,.json,application/json';
    input.style.display = 'none';
    input.style.visibility = 'hidden';
    this.input = input;
    return input;
  }

  attachEvents() {
    const zone = document.querySelector('.splash .dropzone');
    const input = this.fileInput();
    if (!zone || !input) {
      return;
    }

    input.onchange = () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) {
        this.takeFile(file);
      }
    };

    zone.onclick = () => {
      input.click();
    };

    zone.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      input.click();
    };

    zone.ondragenter = (event) => {
      event.preventDefault();
      zone.classList.add('over');
    };

    zone.ondragover = (event) => {
      event.preventDefault();
      zone.classList.add('over');
    };

    zone.ondragleave = (event) => {
      if (!zone.contains(event.relatedTarget)) {
        zone.classList.remove('over');
      }
    };

    zone.ondrop = (event) => {
      event.preventDefault();
      zone.classList.remove('over');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        this.takeFile(file);
      }
    };

    const learn = document.querySelector('.splash [data-how]');
    if (learn) {
      learn.onclick = () => this.main.showHow();
    }
  }

  takeFile(file) {
    this.mod.importFile(file);
  }
}

module.exports = Splash;
