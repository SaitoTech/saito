/**
 * In-overlay Faucet authentication stage for BuySaito.
 * Rendered into #buysaito-stage — does not create a SaitoOverlay.
 */
module.exports = (providers = []) => {
  const actions = providers
    .map((provider) => {
      const id = String(provider.id || '').trim();
      const name = String(provider.name || id || 'Continue');
      const icon = String(provider.icon || '');
      const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i>` : '';
      return `
        <button type="button" class="saito-button-primary" data-buysaito-auth-provider="${id}">
          ${iconHtml}
          Continue with ${name}
        </button>`;
    })
    .join('');

  return `
    <div class="buysaito-faucet-auth">
      <h3 class="buysaito-faucet-auth-title">Verify Your Account</h3>
      <p class="buysaito-faucet-auth-message">
        To receive free SAITO from the faucet, please verify an existing online account.
        This helps us prevent automated abuse and reserve faucet tokens for real users and developers.
      </p>
      <div class="buysaito-faucet-auth-actions">
        ${actions}
      </div>
      <div class="buysaito-stage-nav">
        <button type="button" class="buysaito-stage-back" data-buysaito-stage-back>
          ← Back
        </button>
      </div>
    </div>
  `;
};
