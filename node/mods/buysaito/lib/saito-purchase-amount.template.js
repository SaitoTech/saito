module.exports = (app, mod, self) => {
  let data = mod.available_currencies.find(
    (element) => element.ticker == self.crypto_selected.ticker
  );
  if (!data) return '';

  let img = data.icon_url || `/${data.ticker.toLowerCase()}/img/logo.png`;

  let results = app.modules.getRespondTos('crypto-logo', { ticker: data.ticker }).shift();

  if (results?.img) {
    img = results?.img;
  }

  let logo = `<img class='crypto-logo' src='${img}'>`;
  if (results?.sub_logo) {
    logo += `<img class='chain-logo' src='${results?.sub_logo}'>`;
  }

  let saito_img = '/saito/img/saito-icon.png';
  let saito_results = app.modules.getRespondTos('crypto-logo', { ticker: 'SAITO' }).shift();

  if (saito_results?.img) {
    saito_img = saito_results.img;
  }

  let saito_logo = `<img class='crypto-logo' src='${saito_img}'>`;
  if (saito_results?.sub_logo) {
    saito_logo += `<img class='chain-logo' src='${saito_results.sub_logo}'>`;
  }

  let html = `
    <div class="amount-selection-box saito-overlay-panel saito-overlay-size narrow">

      <div class='saito-purchase-deposit-header'>Select Amount</div>
      <div class='crypto-box'>
        <div class="amount-selection-logo">${logo}</div>
        <input type="number" autocomplete="off" min="0" max="9999999999.99999999" step="0.00000001" class="saito-input buysaito-input-amount" id="input-amount" value="" required="" aria-label="Amount in ${data.ticker}" placeholder="${data.ticker}">
      </div>
      <div class='crypto-box'>
        <div class="amount-selection-logo">${saito_logo}</div>
        <input type="text" class="saito-input expected_amount" aria-label="Approximate amount in SAITO" placeholder="SAITO (approx.)" readonly>
      </div>

      <div class="saito-button-row auto-size">
        <button id="back-purchase-btn" class="saito-button-secondary">Back</button>
        <button id="next-purchase-btn" class="saito-button-primary">Next</button>
      </div>
    </div>
  `;

  return html;
};
