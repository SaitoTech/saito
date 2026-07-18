/**
 * In-game crypto receive overlay — structural markup only.
 *
 * `data-receive-state` and `data-receive-mode` are set from receive.js after mount.
 */
module.exports = function cryptoReceiveOverlayTemplate(details) {
  let ca = false;
  if (details.address && details.address !== details.publicKey) {
    ca = details.address.includes('|') ? details.address.split('|')[0] : details.address;
  }

  return `
  <div
    class="saito-crypto-transfer crypto-receive-overlay"
    id="receive-crypto-request-root"
    data-receive-state="pending"
    data-receive-mode="interactive"
  >
    <header class="crypto-receive-overlay__header">
      <h2 class="auth-title crypto-receive-overlay__title" id="crypto_receive_title">Receiving Payment</h2>
    </header>

    <div class="crypto-receive-overlay__body">
      <div class="crypto-receive-overlay__status" aria-live="polite">
        <div class="saito-spinner spinner crypto-receive-overlay__spinner" id="crypto_receive_spinner"></div>
        <i
          id="crypto_receive_icon_success"
          class="game-crypto-icon crypto-receive-overlay__result-icon crypto-receive-overlay__result-icon--success fa-solid fa-circle-check"
          aria-hidden="true"
        ></i>
      </div>

      <section class="crypto-receive-overlay__summary" aria-label="Amount">
        <div class="amount crypto-receive-overlay__amount" id="crypto_receive_amount">${details.amount} ${details.ticker}</div>
      </section>

      <section class="crypto-receive-overlay__sender" aria-labelledby="crypto_receive_sender_label">
        <div class="crypto-receive-overlay__summary-label" id="crypto_receive_sender_label">From</div>
        <div class="counterparty-details"></div>
        ${
          ca
            ? `
          <div class="crypto-receive-overlay__chain-address" id="crypto_receive_address">${ca.length > 16 ? `${ca.slice(0, 8)}…${ca.slice(-8)}` : ca}</div>
        `
            : ''
        }
      </section>
    </div>

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--trusted">
      <div class="crypto-transfer-countdown crypto-receive-overlay__countdown" aria-live="polite">
        Closing in <span id="crypto_receive_countdown">3</span>s
      </div>
    </footer>

    <footer class="crypto-receive-overlay__footer crypto-receive-overlay__footer--interactive">
      <button
        type="button"
        class="saito-button-primary crypto-transfer-btn crypto-receive-overlay__close-btn"
        id="crypto_receive_close"
      >
        Close
      </button>
      <label class="crypto-receive-overlay__ignore">
        <input
          type="checkbox"
          checked
          id="crypto_receive_ignore"
          class="saito-checkbox ignore-checkbox crypto-receive-overlay__ignore-checkbox"
        />
        <span class="crypto-receive-overlay__ignore-label">Don't wait for confirmation</span>
      </label>
    </footer>
  </div>`;
};
