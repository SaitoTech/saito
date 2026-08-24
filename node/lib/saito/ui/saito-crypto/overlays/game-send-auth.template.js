module.exports = function gameSendAuthTemplate(details) {
  const partyKey = details.partyKey
    ? `<div class="game-crypto-party-key">${details.partyKey}</div>`
    : '';

  return `
  <div class="saito-crypto-transfer game-crypto-transfer-card game-send-auth-overlay" id="game-send-auth-root">
    <div class="game-send-auth-overlay__body game-crypto-transfer-card__body">
      <div class="game-send-auth-overlay__amount game-crypto-transfer-card__amount">${details.amount} ${details.ticker}</div>

      <section class="game-send-auth-overlay__party game-crypto-transfer-card__party" aria-labelledby="game_send_auth_to_label">
        <div class="game-send-auth-overlay__party-label game-crypto-transfer-card__party-label" id="game_send_auth_to_label">
          <span>TO</span>
        </div>
        <div class="game-crypto-party">
          <div class="game-crypto-party-name">${details.partyName || ''}</div>
          ${partyKey}
        </div>
      </section>

      <div class="game-send-auth-overlay__prefs game-crypto-transfer-card__prefs">
        <label class="game-send-auth-overlay__checkbox-label game-crypto-transfer-card__checkbox-label">
          <input type="checkbox" id="game_send_auth_auto_issue" class="saito-checkbox" ${details.trusted ? 'checked' : ''} />
          <span>auto-authorize in-game transfers</span>
        </label>
      </div>
    </div>

    <footer class="game-send-auth-overlay__footer game-crypto-transfer-card__footer">
      <button type="button" class="saito-button-primary game-crypto-transfer-card__action" id="game_send_auth_authorize">
        Authorize Transfer
      </button>
    </footer>
  </div>`;
};
