module.exports = (app, mod) => {
  const amountLabel = `${app.wallet.convertNolanToSaito(mod.amount)} SAITO`;

  return `
  <div class="main faucet-main">
    <div
      class="saito-overlay-form withdraw-container faucet-container faucet-page"
      id="faucet-request-container"
      data-faucet-state="idle"
    >
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title" id="faucet_title">Testnet Faucet</div>
      </div>

      <div class="faucet-intro">
        Request testnet SAITO for development and testing on the network.
      </div>

      <div class="faucet-amount">${amountLabel}</div>

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

      <div class="saito-button-row auto-size faucet-actions">
        <button type="button" class="saito-button-primary fat" id="faucet-button">
          Request Testnet SAITO
        </button>
        <button type="button" class="saito-button-secondary fat" id="faucet-close-btn">
          Close
        </button>
      </div>

      <div class="footer-note">
        Need mainnet SAITO?<br>Visit our <a href="/buy">purchase portal</a>.
      </div>
    </div>
  </div>`;
};
