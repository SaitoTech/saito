module.exports = (app, mod, self) => {
  let data = mod.available_currencies.find(
    (element) => element.ticker == self.crypto_selected.ticker
  );
  if (!data) return '';

  let url = data.icon_url || `/${data.ticker.toLowerCase()}/img/logo.png`;

  let html = `
    <div class="amount-selection-box saito-overlay-size narrow">

      <div class='saito-purchase-deposit-header'>Select Amount</div>
      <div class='crypto-box'>
        <div>${data.ticker}</div>
        <img class="crypto-logo" src="${url}">
        <input type="number" autocomplete="off" min="0" max="9999999999.99999999" step="0.00000001" class="input-amount" id="input-amount" value="" required="" placeholder="amount to spend">
      </div>
      <div class='crypto-box'>
        <div>SAITO</div>
        <div>(approx)</div>
        <div class="expected_amount"></div>
      </div>

      <div class="saito-button-row auto-size">
        <button id="back-purchase-btn" class="saito-button-secondary">Back</button>
        <button id="next-purchase-btn" class="saito-button-primary">Next</button>
      </div>
    </div>
  `;

  return html;
};
