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
        : 'Click, or Drag and Drop .saito Module to Install';

      const urlForm = document.querySelector('#saito-app-url-form');
      const urlInput = urlForm.querySelector('input');
      const urlButton = urlForm.querySelector('button');
      const dropzone = document.querySelector('#saito-app-upload');
      const dropzoneText = dropzone.querySelector('.saito-file-dropzone-text');
      let importing = false;

      const getImportUrl = () => {
        const value = urlInput.value.trim();
        if (!/^https?:\/\//i.test(value)) {
          return null;
        }
        try {
          const url = new URL(value);
          return url.pathname.endsWith('.saito') ? url : null;
        } catch (err) {
          return null;
        }
      };

      const updateImportButton = () => {
        urlButton.disabled = importing || !getImportUrl();
      };
      urlInput.addEventListener('input', updateImportButton);
      urlInput.addEventListener('change', updateImportButton);
      updateImportButton();

      const restoreDropzone = (dropzone) => {
        if (!dropzone) {
          return;
        }
        dropzoneText.textContent = dropPrompt;
      };

      const importFile = (filesrc) => {
        dropzoneText.textContent = 'Reading module...';

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
      };

      this.app.browser.addDragAndDropFileUploadToElement(
        'saito-app-upload',
        (filesrc) => {
          if (!importing && urlForm.isConnected) {
            importFile(filesrc);
          }
        },
        true,
        false,
        true
      );

      urlForm.onsubmit = async (event) => {
        event.preventDefault();
        if (importing) {
          return;
        }

        const url = getImportUrl();
        if (!url) {
          updateImportButton();
          return;
        }

        importing = true;
        urlInput.disabled = true;
        urlButton.disabled = true;
        urlButton.textContent = 'Importing...';
        dropzoneText.textContent = 'Downloading module...';

        try {
          const response = await fetch(url.href, { credentials: 'omit' });
          if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
          }
          const filesrc = await response.text();
          if (urlForm.isConnected) {
            importFile(filesrc);
          }
        } catch (err) {
          console.error('Error downloading .saito application:', err);
          if (urlForm.isConnected) {
            salert(
              'Unable to download the .saito file. Check the URL and that the server allows cross-origin downloads, or upload the file locally.'
            );
          }
        } finally {
          importing = false;
          urlInput.disabled = false;
          updateImportButton();
          urlButton.textContent = 'Import';
          restoreDropzone(dropzone);
        }
      };
    } catch (err) {
      console.error('Error: ', err);
      salert('An error occurred while getting application details. Check console for details.');
    }
  }
}

module.exports = AddAppOverlay;
