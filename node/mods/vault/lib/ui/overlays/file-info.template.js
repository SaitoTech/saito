module.exports = (app, mod, file_info = {}) => {
  return `
<div class="vault-file-info vault-file-info-wrapper">

  <div class="vault-file-info-waiting">
    <div class="vault-file-info-waiting-inner">
      <div class="vault-loading-title">Upload complete</div>
      <div class="vault-loading-subtext">Waiting for your Vault Key…</div>
      <div class="vault-loading-spinner">
        <div class="saito_spinner"></div>
      </div>
      <div class="vault-file-info-countdown" id="vault-file-info-countdown">—</div>
      <div class="vault-file-info-status" id="vault-file-info-status">
        This page will update automatically when your Vault Key arrives. No refresh needed.
      </div>
    </div>
  </div>

  <div class="vault-file-info-success" style="display:none; opacity:0;">
    <div class="vault-file-info-success-checks">✓ File uploaded</div>
    <div class="vault-file-info-success-checks">✓ Vault Key received</div>
    <p>Your Vault Key has arrived in your wallet.</p>
    <p>
      You can now open &quot;My NFTs&quot;, select your Vault Key, and retrieve this file immediately.
    </p>
    <p>
      Or <span id="open-vault" class="saito-anchor">access your file here</span>.
    </p>
  </div>
</div>
  `;
};
