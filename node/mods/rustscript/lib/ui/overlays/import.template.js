const { buildRustscriptOverlay } = require('./overlay.shell');
const { dropzoneMarkup } = require('./import-dropzone');

module.exports = {
  idleOverlay({ error = '' } = {}) {
    const errorBlock = error
      ? `<p class="rs-import-error" role="alert">${error}</p>`
      : `<p class="rs-import-error" hidden role="alert"></p>`;

    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-import-overlay',
      title: 'Import Transaction',
      titleClass: 'rs-overlay-title-hero',
      bodyHtml: `
        ${dropzoneMarkup({
          id: 'rs-import-drop-zone',
          ariaLabel: 'Import transaction file',
          lead: 'drag and drop a transaction file here',
          clickHint: 'or click here'
        })}

        ${errorBlock}

        <div class="rs-import-divider" aria-hidden="true"><span>OR</span></div>

        <section class="rs-import-p2sh">
          <h3 class="rs-import-p2sh-heading">Import from P2SH Link</h3>
          <div class="rs-import-p2sh-row">
            <input type="text" class="saito-input rs-import-p2sh-input" placeholder="Paste P2SH link…" spellcheck="false" autocomplete="off" />
            <button type="button" class="rs-btn rs-btn-secondary rs-import-p2sh-btn" data-action="import-p2sh-link">Import</button>
          </div>
        </section>
      `
    });
  },

  loadingOverlay() {
    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-overlay-status rs-import-overlay rs-import-loading',
      title: 'Loading transaction…',
      titleClass: 'rs-overlay-title-loading',
      bodyHtml: `
        <div class="rs-publish-spinner" aria-hidden="true">
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
          <span class="rs-publish-spinner-box"></span>
        </div>
        <p class="rs-overlay-lead rs-import-loading-lead">Processing your transaction file.</p>
      `
    });
  }
};
