/**
 * In-overlay Faucet authentication stage for BuySaito.
 * Rendered into #buysaito-stage — does not create a SaitoOverlay.
 * Back navigation lives in `.buysaito-footer-note` (same footer slot as migration text).
 */
module.exports = (providers = [], message = '') => {
  const actions = providers
    .map((provider) => {
      const id = String(provider.id || '').trim();
      const name = String(provider.name || id || 'Continue');
      const icon = String(provider.icon || '');
      const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i>` : '';
      const label = String(provider.label || 'Continue with ' + name);
      return `
        <button type="button" class="saito-button-secondary buysaito-auth-provider" data-buysaito-auth-provider="${id}">
          ${iconHtml}
          <span>${label}</span>
        </button>`;
    })
    .join('');

  const body =
    String(message || '').trim() ||
    'The SAITO Faucet exists to help new users try the advanced features of the network. Registration requires a GitHub or Twitter account that is at least six months old.';

  return `
    <div class="buysaito-faucet-auth">
      <p class="buysaito-faucet-auth-message">
        ${body}
      </p>
      <div class="buysaito-faucet-auth-actions">
        ${actions}
      </div>
    </div>
  `;
};
