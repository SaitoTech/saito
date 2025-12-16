const FileInfoTemplate = require('./file-info.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');


class FileInfo {

  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.sig = "";
  }

  render() {
    this.overlay.show(FileInfoTemplate(this.app, this.mod, this));
    setTimeout(() => this.attachEvents(), 25);
  }

  attachEvents() {
    try {
    document.getElementById('.vault-copy-sig').onclick = (e) => {
      try {
        navigator.clipboard.writeText(this.privateKey);
        let icon_element = document.querySelector('.vault-copy-sig i');
        if (icon_element) {
          icon_element.classList.toggle('fa-copy');
          icon_element.classList.toggle('fa-check');
          setTimeout(() => {
            icon_element.classList.toggle('fa-copy');
            icon_element.classList.toggle('fa-check');
          }, 1500);
        }
      } catch (err) {}
    };

    document.querySelector('.vault-sig-grid div').addEventListener('click', function (e) {
      try {
        const el = e.target;
        if (el.select) {
          el.select();
        } else {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (err) {
      }
    });
    } catch (err) {}
  }

}

module.exports = FileInfo;

