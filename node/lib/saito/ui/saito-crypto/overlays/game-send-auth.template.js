module.exports = function gameSendAuthTemplate(details) {
  return `
  <div class="saito-crypto-transfer game-send-auth-overlay" id="game-send-auth-root">
    <header class="game-send-auth-overlay__header">
      <h2 class="saito-overlay-form-header-title">Authorize Payment</h2>
    </header>

    <div class="game-send-auth-overlay__body">
      <div class="game-send-auth-overlay__amount">${details.amount} ${details.ticker}</div>

      <section class="game-send-auth-overlay__recipient">
        <div class="game-send-auth-overlay__label">To</div>
        <div class="counterparty-details"></div>
      </section>

      <div class="game-send-auth-overlay__prefs">
        <label class="game-send-auth-overlay__checkbox-label">
          <input type="checkbox" id="game_send_auth_auto_issue" class="saito-checkbox" ${details.trusted ? 'checked' : ''} />
          <span>auto-issue payments</span>
        </label>
        <p class="game-send-auth-overlay__hint">To change this setting in the future, open Crypto Settings in the Game Menu.</p>
      </div>
    </div>

    <footer class="game-send-auth-overlay__footer">
      <button type="button" class="saito-button-primary" id="game_send_auth_authorize">
        AUTHORIZE PAYMENT
      </button>
    </footer>
  </div>`;
};
