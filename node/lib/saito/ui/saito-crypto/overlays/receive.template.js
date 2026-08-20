/**
 * In-game crypto receive overlay — structural markup only.
 *
 * Shared overlay for:
 *   pending  → "Awaiting Transfer"
 *   success  → "Payment Received"  (title + state set from receive.js)
 *
 * `data-receive-state` and `data-receive-mode` are set from receive.js after mount.
 */
module.exports = function cryptoReceiveOverlayTemplate(details) {
  const partyKey = details.partyKey
    ? `<div class="game-crypto-party-key">${details.partyKey}</div>`
    : '';

  return `
  <div
    class="saito-crypto-transfer crypto-receive-overlay"
    id="receive-crypto-request-root"
    data-receive-state="pending"
    data-receive-mode="interactive"
  >
    <div class="crypto-receive-overlay__body">
      <div class="crypto-receive-overlay__status" aria-live="polite">
        <div class="saito-spinner spinner crypto-receive-overlay__spinner" id="crypto_receive_spinner"></div>
        <i
          id="crypto_receive_icon_success"
          class="game-crypto-icon crypto-receive-overlay__result-icon crypto-receive-overlay__result-icon--success fa-solid fa-circle-check"
          aria-hidden="true"
        ></i>
      </div>

      <header class="crypto-receive-overlay__header">
        <h2 class="crypto-receive-overlay__title" id="crypto_receive_title">Awaiting Transfer</h2>
      </header>

      <div class="crypto-receive-overlay__amount" id="crypto_receive_amount">${details.amount} ${details.ticker}</div>

      <section class="crypto-receive-overlay__party" aria-labelledby="crypto_receive_sender_label">
        <div class="crypto-receive-overlay__party-label" id="crypto_receive_sender_label">
          <span>From</span>
        </div>
        <div class="game-crypto-party">
          <div class="game-crypto-party-name">${details.partyName || ''}</div>
          ${partyKey}
        </div>
      </section>

      <div class="crypto-receive-overlay__prefs">
        <label class="crypto-receive-overlay__checkbox-label">
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

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--trusted">
      <div class="crypto-transfer-countdown crypto-receive-overlay__countdown" aria-live="polite">
        Closing in <span id="crypto_receive_countdown">3</span>s
      </div>
    </footer>

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--interactive">
      <button
        type="button"
        class="saito-button-primary crypto-receive-overlay__close-btn"
        id="crypto_receive_continue"
      >
        Continue
      </button>
    </footer>
  </div>`;
};
