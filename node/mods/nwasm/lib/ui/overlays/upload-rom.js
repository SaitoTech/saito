const UploadRomOverlayTemplate = require('./upload-rom.template');
const NewGameOverlay = require('./new-game');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class UploadRomOverlay {
  constructor(app, mod = null, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.new_game_overlay = new NewGameOverlay(app, mod);
    this.busy = false;
  }

  render() {
    this.busy = false;
    this.overlay.show(UploadRomOverlayTemplate(this.app, this.mod));
    this.attachEvents();
  }

  setBusy(message = 'Uploading ROM…') {
    this.busy = true;
    let root = document.querySelector('.nwasm-upload-rom');
    let state = root?.querySelector('.state');
    let status = root?.querySelector('.instructions') || root?.querySelector('.status');
    let dropzone = document.getElementById('nwasm-upload-rom');

    if (state) {
      state.hidden = false;
    }
    if (status) {
      status.innerHTML = message;
    }
    if (dropzone) {
      dropzone.classList.add('busy');
    }
  }

  attachEvents() {
    let uploader = this;

    try {
      this.app.browser.addDragAndDropFileUploadToElement(
        'nwasm-upload-rom',
        async (file, _is_drag, native_file) => {
          if (uploader.busy) {
            return;
          }

          if (!file) {
            alert('Unable to read that ROM file.');
            return;
          }

          uploader.mod.active_rom = file;
          uploader.overlay.hide();
          uploader.new_game_overlay.render({
            file,
            file_name: native_file?.name || 'Selected ROM'
          });
        },
        false,
        true
      );
    } catch (err) {
      console.log('ROM file upload error: ' + err);
      this.busy = false;
    }
  }
}

module.exports = UploadRomOverlay;
