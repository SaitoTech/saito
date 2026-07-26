const { buildRustscriptOverlay } = require('./overlay.shell');

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
        <div id="rs-import-drop-zone" class="rs-import-dropzone" tabindex="0" role="button" aria-label="Import transaction file">
          <svg class="rs-import-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="rs-import-dropzone-lead">drag and drop a transaction file here</p>
          <p class="rs-import-dropzone-click">or click here</p>
          <input type="file" class="rs-import-file-input" accept=".json,application/json,text/plain" hidden />
        </div>

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
