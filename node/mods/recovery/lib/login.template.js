module.exports = () => {
  return `
      <form id="login-template" class="saito-recovery">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title">Restore Account</div>
        </div>
        <div class="saito-overlay-form-text">
          <p>Restore an account by <span class="saito-text-link" id="restore-private-key" role="button" tabindex="0">importing your private key</span> or <span class="saito-text-link" id="restore-seed-phrase" role="button" tabindex="0">providing your seed phrase</span>.</p>
          <p>The form below can be used to initiate a remote fetch-and-decrypt if you have previously enabled remote backup.</p>
        </div>
        <input type="email" id="saito-overlay-form-input" class="saito-input saito-overlay-form-email" placeholder="address@domain.com" value="" autocomplete="username" />
        <input type="password" id="saito-overlay-form-input" class="saito-input saito-overlay-form-password saito-password" placeholder="password" value="" autocomplete="current-password" />
        <div class="saito-button-row">
          <button type="button" class="saito-button-primary saito-overlay-form-submit saito-overlay-login-submit" id="saito-overlay-submit">Restore</button>
        </div>
      </form>
  `;
};
