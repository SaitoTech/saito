module.exports = () => {
  return `
      <form id="login-template" class="saito-overlay-form">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Decrypt Wallet</div>
        </div>
        <div class="saito-overlay-form-text">Provide your email address and password to decrypt your wallet</div>
        <input type="text" id="saito-overlay-form-input" class="saito-overlay-form-input saito-overlay-form-email" placeholder="address@domain.com" value="" />
        <input type="text" id="saito-overlay-form-input" class="saito-overlay-form-input saito-overlay-form-password saito-password" placeholder="password" value="" />
        <div class="saito-button-row">
          <button type="button" class="saito-button-primary" id="wallet-decryption-submit">Decrypt</button>
        </div>
      </form>
  `;
};
