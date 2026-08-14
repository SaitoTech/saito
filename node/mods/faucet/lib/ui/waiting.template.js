module.exports = (app, mod, opts = {}) => {
  const timeout = !!opts.timeout;

  if (timeout) {
    return `
  <div class="waiting timeout">
    <div class="visual" aria-hidden="true">
      <i class="icon error fa-solid fa-circle-exclamation"></i>
    </div>
    <h1 class="title">SAITO Could Not Be Received</h1>
    <p class="message">
      We were not able to confirm your faucet transaction yet. You can close this window and try again.
    </p>
    <div class="actions">
      <button type="button" class="saito-button-secondary">
        Close
      </button>
    </div>
  </div>`;
  }

  return `
  <div class="waiting">
    <h1 class="title">Please Be Patient</h1>
    <p class="message">
      Our server is processing your request for SAITO tokens. It may take a few blocks for the transfer to complete. This screen will update when the tokens arrive.
    </p>
    <div class="timer">
      <span class="timer-label">expected time to next block</span>
      <span class="countdown" aria-live="polite">—</span>
      <span class="timer-unit">seconds</span>
    </div>
  </div>`;
};
