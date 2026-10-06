module.exports = () => `<div class="robots-payment saito-overlay-form">
  <h2>Safe teleport</h2>
  <p data-payment-message></p>
  <label><input type="checkbox" class="saito-checkbox" data-payment-remember> Don't show this again</label>
  <div class="payment-actions">
    <button type="button" class="saito-button-secondary" data-payment-cancel>Cancel</button>
    <button type="button" class="saito-button-primary" data-payment-confirm>Pay 1 SAITO + fee</button>
  </div>
</div>`;
