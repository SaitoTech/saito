module.exports = (app, mod) => {
  const amountLabel = `${app.wallet.convertNolanToSaito(mod.amount)} SAITO`;

  return `
  <div
    class="faucet-acquisition"
    id="faucet-request-container"
    data-faucet-state="eligible"
  >
    <div class="faucet-acquisition-visual" aria-hidden="true">
      <i
        id="faucet_success_icon"
        class="faucet-acquisition-icon faucet-success-icon fa-solid fa-circle-check"
        hidden
      ></i>
      <div
        class="saito-spinner spinner"
        id="faucet_spinner"
        role="status"
        aria-label="Getting your SAITO"
        hidden
      ></div>
      <i
        id="faucet_error_icon"
        class="faucet-acquisition-icon faucet-error-icon fa-solid fa-circle-exclamation"
        hidden
      ></i>
    </div>

    <h1 class="faucet-acquisition-title" id="faucet_title">
      You're Eligible for Free SAITO
    </h1>

    <p class="faucet-acquisition-message" id="faucet_message">
      Registration succeeded. You can receive enough free SAITO to try the network.
    </p>

    <p class="faucet-acquisition-amount" id="faucet_amount">${amountLabel}</p>

    <p class="faucet-acquisition-progress" id="faucet_progress" hidden></p>

    <div class="faucet-acquisition-timer" id="faucet_countdown" hidden>
      <span class="timer-label">expected time to next block</span>
      <span class="countdown" id="faucet_countdown_seconds" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>

    <div class="faucet-acquisition-actions">
      <button type="button" class="saito-button-primary" id="faucet-button">
        Claim My SAITO
      </button>
      <button type="button" class="saito-button-secondary" id="faucet-close-btn" hidden>
        Close
      </button>
    </div>
  </div>`;
};
