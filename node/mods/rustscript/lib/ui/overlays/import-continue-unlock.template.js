const { buildRustscriptOverlay } = require('./overlay.shell');
const { dropzoneMarkup } = require('./import-dropzone');

module.exports = {
  idleOverlay({ error = '' } = {}) {
    const errorBlock = error
      ? `<p class="rs-import-error" role="alert">${error}</p>`
      : `<p class="rs-import-error" hidden role="alert"></p>`;

    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-import-overlay rs-import-continue-unlock-overlay',
      title: 'Continue Unlock Transaction',
      titleClass: 'rs-overlay-title-hero',
      bodyHtml: `
        ${dropzoneMarkup({
          id: 'rs-import-continue-unlock-drop-zone',
          ariaLabel: 'Import unlock transaction file',
          lead: 'Drag and drop an unlock transaction file here',
          clickHint: 'or click to choose a file'
        })}

        ${errorBlock}
      `
    });
  },

  loadingOverlay() {
    return buildRustscriptOverlay({
      className:
        'rs-overlay-modal rs-overlay-status rs-import-overlay rs-import-continue-unlock-overlay rs-import-loading',
      title: 'Loading unlock transaction…',
      titleClass: 'rs-overlay-title-loading',
      bodyHtml: `
        <div class="rs-publish-spinner" aria-hidden="true">
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
        </div>
        <p class="rs-overlay-lead rs-import-loading-lead">Processing your unlock transaction.</p>
      `
    });
  }
};
