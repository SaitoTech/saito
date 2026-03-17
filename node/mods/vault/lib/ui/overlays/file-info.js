const FileInfoTemplate = require('./file-info.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class FileInfo {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.sig = '';
  }

  render() {
    this.overlay.show(FileInfoTemplate(this.app, this.mod, this));

    const fileSizeMB = this.mod?.file?.size ? this.mod.file.size / (1024 * 1024) : 0;

    const MIN_DELAY = 2000;
    const SIZE_DELAY = Math.min(fileSizeMB * 150, 3000);
    const TOTAL_DELAY = MIN_DELAY + SIZE_DELAY;

    const start = Date.now();

    const revealSuccess = () => {
      const loading = document.querySelector('.vault-file-info-loading');
      const success = document.querySelector('.vault-file-info-success');

      if (loading) {
        loading.style.display = 'none';
      }

      if (success) {
        success.style.display = 'block';
        requestAnimationFrame(() => {
          success.style.transition = 'opacity 400ms ease';
          success.style.opacity = 1;
        });
      }

      this.attachEvents();
    };

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, TOTAL_DELAY - elapsed);

    setTimeout(revealSuccess, remaining);
  }

  attachEvents() {
    try {
      let copyBtn = document.querySelector('.vault-copy-sig');
      if (copyBtn) {
        copyBtn.onclick = (e) => {
          try {
            navigator.clipboard.writeText(this.sig);
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
      }

      if (document.getElementById('open-vault')) {
        document.getElementById('open-vault').onclick = (e) => {
          this.overlay.close();
          this.app.connection.emit('vault-file-access-render');
        };
      }

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
        } catch (err) {}
      });
    } catch (err) {}
  }
}

module.exports = FileInfo;
