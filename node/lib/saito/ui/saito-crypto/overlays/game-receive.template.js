/**
 * In-game crypto receive overlay — structural markup only.
 *
 * Shared overlay for:
 *   pending  → "Awaiting Transfer"
 *   success  → "Payment Received"  (title + state set from game-receive.js)
 *
 * `data-receive-state` and `data-receive-mode` are set from game-receive.js after mount.
 */
module.exports = function gameCryptoReceiveOverlayTemplate(details) {
  const partyKey = details.partyKey
    ? `<div class="game-crypto-party-key">${details.partyKey}</div>`
    : '';

  return `
  <div
    class="saito-crypto-transfer game-crypto-transfer-card crypto-receive-overlay"
    id="receive-crypto-request-root"
    data-receive-state="pending"
    data-receive-mode="interactive"
  >
    <div class="crypto-receive-overlay__body game-crypto-transfer-card__body">
      <div class="crypto-receive-overlay__status" aria-live="polite">
        <div class="saito-spinner spinner crypto-receive-overlay__spinner" id="crypto_receive_spinner"></div>
        <i
          id="crypto_receive_icon_success"
          class="game-crypto-icon crypto-receive-overlay__result-icon crypto-receive-overlay__result-icon--success fa-solid fa-circle-check"
          aria-hidden="true"
        ></i>
      </div>

      <header class="crypto-receive-overlay__header game-crypto-transfer-card__header">
        <h2 class="crypto-receive-overlay__title game-crypto-transfer-card__title" id="crypto_receive_title">Awaiting Transfer</h2>
      </header>

      <div class="crypto-receive-overlay__amount game-crypto-transfer-card__amount" id="crypto_receive_amount">${details.amount} ${details.ticker}</div>

      <section class="crypto-receive-overlay__party game-crypto-transfer-card__party" aria-labelledby="crypto_receive_sender_label">
        <div class="crypto-receive-overlay__party-label game-crypto-transfer-card__party-label" id="crypto_receive_sender_label">
          <span>FROM</span>
        </div>
        <div class="game-crypto-party">
          <div class="game-crypto-party-name">${details.partyName || ''}</div>
          ${partyKey}
        </div>
      </section>

      <div class="crypto-receive-overlay__prefs game-crypto-transfer-card__prefs">
        <label class="crypto-receive-overlay__checkbox-label game-crypto-transfer-card__checkbox-label">
          <input
            type="checkbox"
            id="crypto_receive_auto_accept"
            class="saito-checkbox"
            ${details.trustedInbound ? 'checked' : ''}
          />
          <span>auto-accept in-game transfers</span>
        </label>
      </div>
    </div>

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--trusted game-crypto-transfer-card__footer">
      <div class="crypto-transfer-countdown crypto-receive-overlay__countdown" aria-live="polite">
        Closing in <span id="crypto_receive_countdown">3</span>s
      </div>
    </footer>

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--interactive game-crypto-transfer-card__footer">
      <button
        type="button"
        class="saito-button-primary crypto-receive-overlay__close-btn game-crypto-transfer-card__action"
        id="crypto_receive_continue"
      >
        Continue
      </button>
    </footer>
  </div>`;
};
