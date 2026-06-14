module.exports = {
  idleOverlay({ error = '' } = {}) {
    const errorBlock = error
      ? `<p class="rs-import-error" role="alert">${error}</p>`
      : `<p class="rs-import-error" hidden role="alert"></p>`;

    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-import-overlay">
  <div class="rs-publish-workspace-inner rs-import-inner">
    <h2 class="rs-publish-title rs-import-title">Import Transaction</h2>

    <div id="rs-import-drop-zone" class="rs-import-dropzone" tabindex="0" role="button" aria-label="Import transaction file">
      <span class="rs-import-dropzone-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </span>
      <p class="rs-import-dropzone-lead">drag and drop a transaction file here</p>
      <p class="rs-import-dropzone-click">or click here</p>
      <input type="file" class="rs-import-file-input" accept=".json,application/json,text/plain" hidden />
    </div>

    ${errorBlock}

    <div class="rs-import-divider" aria-hidden="true"><span>OR</span></div>

    <section class="rs-import-p2sh">
      <h3 class="rs-import-p2sh-heading">Import from P2SH Link</h3>
      <div class="rs-import-p2sh-row">
        <input type="text" class="rs-import-p2sh-input" placeholder="Paste P2SH link…" spellcheck="false" autocomplete="off" />
        <button type="button" class="rs-btn rs-btn-secondary rs-import-p2sh-btn" data-action="import-p2sh-link">Import</button>
      </div>
    </section>
  </div>
</div>`;
  },

  loadingOverlay() {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-import-overlay rs-import-loading">
  <div class="rs-publish-workspace-inner rs-import-loading-inner">
    <div class="rs-publish-spinner" aria-hidden="true">
      <span class="rs-publish-spinner-box"></span>
      <span class="rs-publish-spinner-box"></span>
      <span class="rs-publish-spinner-box"></span>
      <span class="rs-publish-spinner-box"></span>
    </div>
    <h2 class="rs-publish-title rs-import-loading-title">Loading transaction…</h2>
    <p class="rs-publish-lead rs-import-loading-lead">Processing your transaction file.</p>
  </div>
</div>`;
  }
};
