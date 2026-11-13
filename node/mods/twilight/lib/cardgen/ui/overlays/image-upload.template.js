module.exports = () => {
  return `
    <div class="tscardgen-image-upload saito-overlay-form retain-surface">
      <div class="tscardgen-image-dropzone active-tab paste_event" id="tscardgen-image-dropzone">
        <i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>
        <div class="tscardgen-image-dropzone-text">Drag and drop image, or click to select.</div>
      </div>
      <p class="tscardgen-image-upload-note">Images larger than 298×150 are scaled to fit.</p>
      <div class="tscardgen-image-upload-result" data-image-result hidden>
        <div class="tscardgen-image-upload-preview" data-image-preview>
          <img class="tscardgen-image-upload-photo" alt="Selected card image preview" />
        </div>
        <div class="tscardgen-image-upload-actions">
          <button type="button" class="saito-button-primary tscardgen-image-upload-confirm">
            Confirm
          </button>
        </div>
      </div>
    </div>
  `;
};
