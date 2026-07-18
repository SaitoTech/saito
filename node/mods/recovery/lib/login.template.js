module.exports = () => {
  return `
      <form id="login-template" class="saito-recovery">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Account Login</div>
        </div>
        <div class="saito-overlay-form-text">Provide your email address and password if you previously set up automatic backups. We will fetch your wallet and decrypt it for this browser.</div>
        <input type="text" id="saito-overlay-form-input" class="saito-input saito-overlay-form-email" placeholder="address@domain.com" value="" />
        <input type="text" id="saito-overlay-form-input" class="saito-input saito-overlay-form-password saito-password" placeholder="password" value="" />
        <div class="saito-button-row">
          <div class="saito-anchor" id="input-private-key"><span>Enter private key or seed phrase...</span></div>
          <button type="button" class="saito-button-secondary fat" id="upload-file">Upload Wallet</button>
          <button type="button" class="saito-button-primary fat saito-overlay-form-submit saito-overlay-login-submit" id="saito-overlay-submit">Download & Decrypt</button>
        </div>
      </form>
  `;
};
