const SaitoOverlay = require('../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoPhotoCropper = require('../../../../../../lib/saito/ui/saito-photo-cropper/saito-photo-cropper');
const ImageUploadTemplate = require('./image-upload.template');

/**
 * Card-image picker overlay.
 * Visual conventions follow SaitoSign / Install Module drop targets.
 */
class ImageUploadOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.photoCropper = new SaitoPhotoCropper(app, mod, 'free');
    this.callbackAfterConfirm = null;
    this.image = null;

    this.photoCropper.callbackAfterCrop = (image) => {
      this.image = image;
      try {
        this.photoCropper.overlay.remove();
      } catch (error) {
        console.error('TSCardGen: failed to close photo cropper', error);
      }
      this.refreshPreview();
    };
  }

  render(existing_image = null) {
    this.image = existing_image || null;
    this.overlay.show(ImageUploadTemplate());
    this.refreshPreview();
    this.attachEvents();
  }

  refreshPreview() {
    const dropzone = document.getElementById('tscardgen-image-dropzone');
    const note = document.querySelector('.tscardgen-image-upload-note');
    const result = document.querySelector('.tscardgen-image-upload-result');
    const photo = document.querySelector('.tscardgen-image-upload-photo');
    const hasImage = Boolean(this.image);

    if (dropzone) {
      dropzone.hidden = hasImage;
    }
    if (note) {
      note.hidden = hasImage;
    }
    if (result) {
      result.hidden = !hasImage;
    }
    if (photo) {
      photo.src = hasImage ? this.image : '';
    }
  }

  attachEvents() {
    this.app.browser.addDragAndDropFileUploadToElement(
      'tscardgen-image-dropzone',
      async (result) => {
        if (!result) {
          return;
        }
        try {
          this.photoCropper.render(result);
        } catch (error) {
          console.error('TSCardGen: image crop failed', error);
        }
      }
    );

    document.querySelector('.tscardgen-image-upload-actions')?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.querySelector('.tscardgen-image-upload-confirm')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (!this.image) {
        return;
      }
      const confirmed = this.image;
      this.overlay.remove();
      if (typeof this.callbackAfterConfirm === 'function') {
        this.callbackAfterConfirm(confirmed);
      }
    });
  }
}

module.exports = ImageUploadOverlay;
