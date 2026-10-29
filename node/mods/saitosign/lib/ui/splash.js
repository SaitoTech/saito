const SplashTemplate = require('./splash.template');
const { isPdf } = require('../document');
const { looksLikeWebTransaction } = require('../transaction');
const { isZipFile, looksLikeZip } = require('../zip');

class Splash {
  constructor(app, mod, main) {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.notice = '';
    this.staged = [];
    this.drag_index = -1;
  }

  clearStaged() {
    this.staged = [];
    this.drag_index = -1;
  }

  render() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }

    container.classList.add('saitosign');
    this.app.browser.replaceElementContentBySelector(
      SplashTemplate({
        notice: this.notice,
        files: this.staged.map((file) => ({ name: file.name || 'document.pdf' }))
      }),
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
    input.accept = 'application/pdf,.pdf,.saitosign,.zip,application/zip,.saito,.json,application/json';
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

    const learn = document.querySelector('.splash [data-faq]');
    if (learn) {
      learn.onclick = () => this.main.showFaq();
    }

    document.querySelectorAll('.splash [data-remove-staged]').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeStaged(Number(button.dataset.removeStaged));
      };
    });

    const prepare = document.querySelector('.splash [data-prepare]');
    if (prepare) {
      prepare.onclick = (event) => {
        event.preventDefault();
        this.prepare();
      };
    }

    this.attachReorder();
  }

  attachReorder() {
    const list = document.querySelector('.splash .staged-list');
    if (!list) {
      return;
    }

    list.querySelectorAll('.staged-item').forEach((item) => {
      item.ondragstart = (event) => {
        this.drag_index = Number(item.dataset.stagedIndex);
        item.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(this.drag_index));
        }
      };

      item.ondragend = () => {
        item.classList.remove('dragging');
        list.querySelectorAll('.staged-item').forEach((row) => row.classList.remove('over'));
        this.drag_index = -1;
      };

      item.ondragover = (event) => {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        item.classList.add('over');
      };

      item.ondragleave = () => {
        item.classList.remove('over');
      };

      item.ondrop = (event) => {
        event.preventDefault();
        item.classList.remove('over');
        const target = Number(item.dataset.stagedIndex);
        const from = this.drag_index;
        if (!Number.isInteger(from) || from < 0 || from === target) {
          return;
        }
        this.moveStaged(from, target);
      };
    });
  }

  async takeFile(file) {
    if (isPdf(file)) {
      this.stagePdf(file);
      return;
    }

    let header = new Uint8Array();
    try {
      header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch (err) {
      header = new Uint8Array();
    }

    // Keep multi-PDF staging for bare PDFs that browsers mislabel.
    if (!isZipFile(file) && !looksLikeZip(header)) {
      let text = '';
      try {
        text = await file.text();
      } catch (err) {
        text = '';
      }
      if (!looksLikeWebTransaction(text) && text.slice(0, 1024).includes('%PDF')) {
        this.stagePdf(file);
        return;
      }
    }

    this.mod.importFile(file);
  }

  stagePdf(file) {
    this.notice = '';
    this.staged.push(file);
    this.render();
  }

  removeStaged(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.staged.length) {
      return;
    }
    this.staged.splice(index, 1);
    this.render();
  }

  moveStaged(from, to) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= this.staged.length ||
      to >= this.staged.length
    ) {
      return;
    }
    const [file] = this.staged.splice(from, 1);
    this.staged.splice(to, 0, file);
    this.render();
  }

  async prepare() {
    if (!this.staged.length) {
      return;
    }
    const files = this.staged.slice();
    await this.mod.importPdfs(files);
  }
}

module.exports = Splash;
