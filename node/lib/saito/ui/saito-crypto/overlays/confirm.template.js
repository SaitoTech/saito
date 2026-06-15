/**
 * External / game crypto transfer confirmation — structural markup only.
 *
 * `data-confirm-state` and `data-confirm-mode` are set from confirm.js after mount.
 * No runtime string interpolation: placeholders stay empty until filled.
 */
module.exports = function cryptoSendConfirmOverlayTemplate() {
  return `
  <div
    class="game-crypto-transfer-manager-container crypto-send-confirm-overlay"
    id="crypto-send-confirm-root"
    data-confirm-state="pending"
    data-confirm-mode="interactive"
  >
    <div class="crypto-send-confirm-overlay__surface">
      <header class="crypto-send-confirm-overlay__header">
        <h2 class="auth_title crypto-send-confirm-overlay__title" id="crypto_send_confirm_title"></h2>
      </header>

      <div class="crypto-send-confirm-overlay__body">
        <div class="crypto-send-confirm-overlay__status" aria-live="polite">
          <div class="saito_spinner spinner crypto-send-confirm-overlay__spinner" id="crypto_send_confirm_spinner"></div>
          <i
            id="crypto_send_confirm_icon_success"
            class="game-crypto-icon crypto-send-confirm-overlay__result-icon crypto-send-confirm-overlay__result-icon--success fa-solid fa-circle-check"
            aria-hidden="true"
          ></i>
          <i
            id="crypto_send_confirm_icon_failure"
            class="game-crypto-icon crypto-send-confirm-overlay__result-icon crypto-send-confirm-overlay__result-icon--failure fa-solid fa-circle-exclamation"
            aria-hidden="true"
          ></i>
        </div>

        <section class="crypto-send-confirm-overlay__summary" aria-label="Amount">
          <div class="amount crypto-send-confirm-overlay__amount" id="crypto_send_confirm_amount"></div>
        </section>

        <section class="crypto-send-confirm-overlay__recipient" aria-labelledby="crypto_send_confirm_recipient_label">
          <div class="crypto-send-confirm-overlay__summary-label" id="crypto_send_confirm_recipient_label">To</div>
          <div class="counterparty-details"></div>
          <div class="crypto-send-confirm-overlay__chain-address" id="crypto_send_confirm_address"></div>
        </section>

        <div
          class="crypto-send-confirm-overlay__detail-message"
          id="crypto_send_confirm_detail"
          role="status"
          aria-live="polite"
        ></div>
      </div>

      <footer class="crypto-send-confirm-overlay__footer crypto-send-confirm-overlay__footer--trusted">
        <div class="crypto-transfer-countdown crypto-send-confirm-overlay__countdown" aria-live="polite">
          Closing in <span id="crypto_send_confirm_countdown">3</span>s
        </div>
      </footer>

      <footer class="crypto-send-confirm-overlay__footer crypto-send-confirm-overlay__footer--interactive">
        <p class="crypto-send-confirm-overlay__countdown-inline" id="crypto_send_confirm_interactive_countdown" hidden></p>
        <button
          type="button"
          class="button saito-button-primary crypto_transfer_btn crypto-send-confirm-overlay__close-btn"
          id="crypto_send_confirm_close"
        >
          Close
        </button>
        <label class="crypto-send-confirm-overlay__ignore">
          <input
            type="checkbox"
            id="crypto_send_confirm_ignore"
            class="ignore_checkbox crypto-send-confirm-overlay__ignore-checkbox"
          />
          <span class="crypto-send-confirm-overlay__ignore-label">Do not ask again</span>
        </label>
      </footer>
    </div>
  </div>`;
};
