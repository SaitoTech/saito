module.exports = (app, mod, opts = {}) => {
  const amountLabel = opts.amountLabel || `${app.wallet.convertNolanToSaito(mod.amount)} SAITO`;

  return `
  <div class="success">
    <div class="visual" aria-hidden="true">
      <i class="icon fa-solid fa-circle-check"></i>
    </div>
    <h1 class="title">Your SAITO Has Arrived</h1>
    <p class="message">You've received ${amountLabel} in your wallet.

Please click the button below to return to your previous action.</p>
    <div class="actions">
      <button type="button" class="saito-button-primary fat">
        Continue
      </button>
    </div>
  </div>`;
};
