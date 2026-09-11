const AddAppOverlayTemplate = require('./add-app.template.js');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const InstallOverlay = require('./install-app.js');
const Transaction = require('../../../../lib/saito/transaction').default;

class AddAppOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.installOverlay = new InstallOverlay(app, mod);

    this.app.connection.on('saito-app-app-render-request', () => {
      this.render();
    });
  }

  render() {
    const isMobile =
      this.app.browser.isMobileBrowser() ||
      (typeof window !== 'undefined' && window.innerWidth <= 768);

    // Same vault-style path: ensure /devtools/style.css is present before
    // drop → install confirmation (Settings/RedSquare hosts).
    this.mod?.attachStyleSheets?.();
    this.overlay.show(AddAppOverlayTemplate(this.app, this.mod, isMobile));
    this.attachEvents();
  }

  attachEvents() {
    try {
      let this_self = this;
      const isMobile =
        this.app.browser.isMobileBrowser() ||
        (typeof window !== 'undefined' && window.innerWidth <= 768);
      const dropPrompt = isMobile
        ? 'Tap to Install .saito Module'
        : 'Drag and Drop .saito Module to Install';

      const restoreDropzone = (dropzone) => {
        if (!dropzone) {
          return;
        }
        dropzone.innerHTML = `<i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i><div class="saito-file-dropzone-text">${dropPrompt}</div>`;
      };

      this.app.browser.addDragAndDropFileUploadToElement(
        `saito-app-upload`,
        async (filesrc) => {
          const dropzone = document.querySelector('#saito-app-upload');
          if (dropzone) {
            dropzone.innerHTML = 'Installing module...';
          }

          try {
            let data = '';
            if (filesrc && filesrc.indexOf('data:application/octet-stream;base64,') >= 0) {
              data = this.app.crypto.base64ToString(filesrc);
            } else {
              data = typeof filesrc === 'string' ? filesrc : '';
            }

            let newtx = new Transaction();
            newtx.deserialize_from_web(this_self.app, data);

            let msg = newtx.returnMessage() || {};
            if (!msg.bin || !(msg.name || msg.slug)) {
              salert('Invalid .saito Application File');
              restoreDropzone(dropzone);
              return;
            }

            this_self.installOverlay.bin = msg.bin;
            this_self.installOverlay.categories = msg.categories;
            this_self.installOverlay.description = msg.description;
            this_self.installOverlay.image = msg.image;
            this_self.installOverlay.publisher = msg.publisher;
            this_self.installOverlay.request = msg.request;
            this_self.installOverlay.name = msg.name;
            this_self.installOverlay.version = msg.version;
            this_self.installOverlay.tx = newtx;
            this_self.installOverlay.tx_json = data;
            this_self.installOverlay.slug = msg.slug;

            this_self.installOverlay.render();
            this_self.overlay.close();
          } catch (err) {
            console.error('Error: ', err);
            salert('Invalid .saito Application File');
            restoreDropzone(dropzone);
          }
        },
        true,
        false,
        true
      );
    } catch (err) {
      console.error('Error: ', err);
      salert('An error occurred while getting application details. Check console for details.');
    }
  }
}

module.exports = AddAppOverlay;
