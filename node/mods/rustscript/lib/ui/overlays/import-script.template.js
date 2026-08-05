const { buildRustscriptOverlay } = require('./overlay.shell');
const { dropzoneMarkup } = require('./import-dropzone');

module.exports = {
  idleOverlay({ error = '' } = {}) {
    const errorBlock = error
      ? `<p class="rs-import-error" role="alert">${error}</p>`
      : `<p class="rs-import-error" hidden role="alert"></p>`;

    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-import-overlay rs-import-script-overlay',
      title: 'Import Saved Script',
      titleClass: 'rs-overlay-title-hero',
      bodyHtml: `
        ${dropzoneMarkup({
          id: 'rs-import-script-drop-zone',
          ariaLabel: 'Import saved script file',
          lead: 'Drag and drop a script file here',
          clickHint: 'or click to choose a file'
        })}

        ${errorBlock}
      `
    });
  },

  loadingOverlay() {
    return buildRustscriptOverlay({
      className:
        'rs-overlay-modal rs-overlay-status rs-import-overlay rs-import-script-overlay rs-import-loading',
      title: 'Loading script…',
      titleClass: 'rs-overlay-title-loading',
      bodyHtml: `
        <div class="rs-publish-spinner" aria-hidden="true">
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
        </div>
        <p class="rs-overlay-lead rs-import-loading-lead">Processing your saved script.</p>
      `
    });
  }
};
