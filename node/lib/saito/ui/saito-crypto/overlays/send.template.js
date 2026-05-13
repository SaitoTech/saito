module.exports = (app, mod, details) => {
  const trusted = Boolean(details?.trusted);
  const showIgnore = !trusted && mod?.game?.over === 0;
  const modeClass = trusted ? 'send-crypto-overlay--mode-trusted' : 'send-crypto-overlay--mode-interactive';
  const ignoreClass = showIgnore ? 'send-crypto-overlay--show-ignore' : '';

  let html = `
  <div class="game-crypto-transfer-manager-container send-crypto-overlay ${modeClass} ${ignoreClass}" id="send-crypto-request-container" data-send-state="pending">
    <div class="send-crypto-overlay__surface">
      <header class="send-crypto-overlay__header">
        <h2 class="auth_title send-crypto-overlay__title" id="auth_title">Sending Payment</h2>
      </header>

      <div class="send-crypto-overlay__body">
        <div class="send-crypto-overlay__status" aria-live="polite">
          <div class="saito_spinner spinner send-crypto-overlay__spinner" id="spinner"></div>
          <i
            id="game-crypto-icon"
            class="game-crypto-icon send-crypto-overlay__result-icon send-crypto-overlay__result-icon--success fa-solid fa-circle-check"
            aria-hidden="true"
          ></i>
          <i
            id="game-crypto-failure-icon"
            class="game-crypto-icon send-crypto-overlay__result-icon send-crypto-overlay__result-icon--failure fa-solid fa-circle-exclamation"
            aria-hidden="true"
          ></i>
        </div>

        <div class="amount send-crypto-overlay__amount">${details.amount} ${details.ticker}</div>
        <div class="counterparty-details"></div>
      </div>`;

  if (!trusted) {
    html += `
      <footer class="send-crypto-overlay__footer send-crypto-overlay__footer--interactive">
        <button type="button" class="button saito-button-primary crypto_transfer_btn send-crypto-overlay__close-btn" id="send_crypto_transfer_btn">Close</button>
        <label class="send-crypto-overlay__ignore">
          <input type="checkbox" id="ignore_checkbox" class="ignore_checkbox send-crypto-overlay__ignore-checkbox" />
          <span class="send-crypto-overlay__ignore-label">Do not ask again</span>
        </label>
      </footer>`;
  } else {
    html += `
      <footer class="send-crypto-overlay__footer send-crypto-overlay__footer--trusted">
        <div class="crypto-transfer-countdown send-crypto-overlay__countdown" aria-live="polite">
          Closing in <span>3</span>s
        </div>
      </footer>`;
  }

  html += `
    </div>
  </div>`;

  return html;
};
