module.exports = (mod, treasury_error = '') => {
  const escaped_error = String(treasury_error)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(String.fromCharCode(39), '&#039;');

  let migration_control = `
    <div class="apebond-treasury-status">
      <div class="saito_spinner"></div>
      <div>Contacting Treasury Bot on Chain</div>
    </div>
  `;

  if (treasury_error) {
    migration_control = `
      <div class="apebond-treasury-error">
        <div>Migration is temporarily unavailable.</div>
        <div>${escaped_error}</div>
      </div>
    `;
  } else if (mod.can_auto) {
    migration_control = `
      <button id="apebond-migrate" class="saito-button-primary fat">Migrate</button>
      <input class="saito-input" type="email" id="apebond-email" name="email" placeholder="email - optional" autocomplete="email" />
    `;
  }

  return `
    <div class="main">
      <div class="saito-overlay-form withdraw-container apebond-container">
        <div class="saito-overlay-form-header apebond-header">
          <div class="saito-overlay-form-header-title withdraw-title">
            SAITO MAINNET MIGRATION
          </div>
        </div>

        <div class="apebond-subtitle">Ape Bond Bonus Portal</div>

        <div class="withdraw-intro apebond-intro"></div>

        <div class="withdraw-form-fields apebond-form-fields">
          ${migration_control}
        </div>

        <div class="apebond-information">
          <p>Enter an email address to get updated about the process.</p>
          <p>Your ERC20 Saito will be migrated immediately. The bonus will be paid once the origin of the ERC20 Saito is confirmed to be Ape Bond.</p>
          <p class="apebond-welcome"><a href="/redsquare">Welcome to the Saitoverse!</a></p>
        </div>
      </div>
    </div>
  `;
};
