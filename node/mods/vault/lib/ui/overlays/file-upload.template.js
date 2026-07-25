module.exports = (app, mod, isMobile = false) => {
  const uploadPrompt = isMobile ? 'Tap to Add File' : 'Drag and Drop File to Upload';
  return `
<div class="vault-upload-overlay saito-overlay-form saito-app-overlay">

  <div class="saito-overlay-form-header">
    <h2 class="saito-overlay-form-header-title">Select File</h2>
  </div>

  <div class="nft-creator saito-app-body">

    <div class="key-step">
      <div class="saito-overlay-form-text" data-key-copy></div>
      <div class="key-artwork" aria-hidden="true"></div>
      <div class="saito-button-row">
        <div class="saito-anchor" data-action="toggle-mode"><span>create custom key...</span></div>
        <button type="button" class="saito-button-primary" data-action="confirm-key">CREATE KEY</button>
      </div>
      <div class="spinner-helper">uploading...<p></p><div class="saito-spinner"></div></div>
    </div>

    <div class="textarea-container">
      <div class="saito-app-upload active-tab paste_event" id="vault-file-upload">
        <i class="fa-solid fa-file-arrow-up"></i>
        <div class="vault-file-upload-text">${uploadPrompt}</div>
      </div>
    </div>

  </div>

</div>
`;
};
