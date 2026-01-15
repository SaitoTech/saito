module.exports = (app, mod, file_info = {}) => {

  return `
<div class="vault-file-info vault-file-info-wrapper">

  <div class="vault-file-info-loading">
    <div class="vault-file-info-loading-inner">
      <div class="vault-loading-title">Uploading file</div>
      <div class="vault-loading-spinner">
        <img src="/saito/img/spinner.svg" />
      </div>
      <div class="vault-loading-subtext">
        Finalizing secure access key…
      </div>
    </div>
  </div>

  <div class="vault-file-info-success" style="display:none; opacity:0;">
    <h2>Success!</h2>
      Your NFT access key is being finalized.
      <p></p>
      Once it arrives, <a href="/vault">access your file</a> here.
  </div>
</div>
  `;
};

