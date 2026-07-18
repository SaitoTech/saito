module.exports = (app, mod) => {
	const amountLabel = `${app.wallet.convertNolanToSaito(mod.amount)} SAITO`;

	return `
  <div
    class="saito-crypto-transfer faucet-overlay"
    id="faucet-request-container"
    data-faucet-state="idle"
  >
    <h2 class="auth_title" id="faucet_title">Testnet Faucet</h2>

    <div class="saito_spinner spinner" id="faucet_spinner"></div>
    <i
      id="faucet_success_icon"
      class="game-crypto-icon fa-solid fa-circle-check"
      aria-hidden="true"
    ></i>

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
