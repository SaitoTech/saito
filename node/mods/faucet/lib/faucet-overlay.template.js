module.exports = (app, mod) => {
  const amountLabel = `${app.wallet.convertNolanToSaito(mod.amount)} SAITO`;

  return `
  <div
    class="saito-crypto-transfer faucet-overlay"
    id="faucet-request-container"
    data-faucet-state="idle"
  >
    <h2 class="auth-title" id="faucet_title">Testnet Faucet</h2>

    <div class="faucet-status">
      <img
        class="faucet-crypto-logo"
        id="faucet_saito_logo"
        src="/saito/img/saito-icon.png"
        alt="Saito"
      />
      <div
        class="saito-spinner spinner"
        id="faucet_spinner"
        role="status"
        aria-label="Requesting testnet SAITO"
        hidden
        style="display: none"
      ></div>
      <i
        id="faucet_success_icon"
        class="faucet-success-icon fa-solid fa-circle-check"
        aria-hidden="true"
        hidden
        style="display: none"
      ></i>
    </div>

    <div class="amount">${amountLabel}</div>

    <div class="faucet-overlay__actions">
      <button type="button" class="saito-button-primary" id="faucet-button">
        Request Testnet SAITO
      </button>
      <button type="button" class="saito-button-secondary" id="faucet-close-btn">
        Close
      </button>
    </div>
  </div>`;
};
