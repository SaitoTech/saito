module.exports = (app, mod, self) => {
  let selected_ticker = self.crypto_selected?.ticker || mod.available_currencies?.[0]?.ticker;
  let data = mod.available_currencies.find((element) => element.ticker == selected_ticker);
  if (!data) {
    return '';
  }

  let img = data.icon_url || `/${data.ticker.toLowerCase()}/img/logo.png`;
  let results = app.modules.getRespondTos('crypto-logo', { ticker: data.ticker }).shift();
  if (results?.img) {
    img = results.img;
  }

  let logo = `<img class='crypto-logo' src='${img}'>`;

  let options = mod.available_currencies
    .map((currency) => {
      let lbl = (currency.ticker || '').toUpperCase();
      let cimg = currency.icon_url || `/${currency.ticker.toLowerCase()}/img/logo.png`;
      let cres = app.modules.getRespondTos('crypto-logo', { ticker: lbl }).shift();
      if (cres?.img) {
        cimg = cres.img;
      }
      let clogo = `<img class='crypto-logo' src='${cimg}'>`;
      return `
        <div class="buysaito-select-option" data-ticker="${lbl}">
          <span class="crypto-logo-container">${clogo}</span>
          <span class="buysaito-select-option-label">${lbl}</span>
        </div>
      `;
    })
    .join('');

  let pay_amount = self.expected_deposit > 0 ? self.expected_deposit : '';
  let receive_amount = self.amount > 0 ? self.amount : '';

  return `
    <div class="amount-selection-box saito-overlay-size buysaito-trade-form">
      <div class='saito-purchase-deposit-header'>Buy SAITO</div>

      <div class="trade-section-label">Pay With</div>
      <div class='crypto-box buysaito-pay-row'>
        <div class="buysaito-token-fixed buysaito-token-dropdown">
          <div class="buysaito-custom-select" id="pay-crypto-select" data-value="${selected_ticker}">
            <button class="buysaito-select-trigger" id="pay-crypto-trigger" type="button">
              <span class="buysaito-select-option buysaito-select-current">
                <span class="crypto-logo-container">${logo}</span>
                <span class="buysaito-select-option-label buysaito-select-trigger-label">${selected_ticker}</span>
              </span>
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="buysaito-select-menu hidden" id="pay-crypto-menu">${options}</div>
          </div>
        </div>
        <input type="number" autocomplete="off" min="0" max="9999999999.99999999" step="0.00000001" class="input-amount buysaito-input" id="pay-amount-input" value="${pay_amount}" placeholder="0.0">
      </div>

      ${
        self.show_percentage_buttons
          ? `
      <div class="buysaito-percent-row">
        <button class="saito-button-secondary purchase-percent-btn" data-percent="12.5">12.5%</button>
        <button class="saito-button-secondary purchase-percent-btn" data-percent="25">25%</button>
        <button class="saito-button-secondary purchase-percent-btn" data-percent="50">50%</button>
        <button class="saito-button-secondary purchase-percent-btn" data-percent="75">75%</button>
        <button class="saito-button-secondary purchase-percent-btn" data-percent="100">MAX</button>
      </div>`
          : ''
      }

      <div class="trade-section-label">Receive</div>
      <div class='crypto-box buysaito-receive-row'>
        <div class="buysaito-token-fixed">
          <img class="crypto-logo" src="/saito/img/touch/pwa-192x192.png" />
          <span>SAITO</span>
        </div>
        <input type="number" autocomplete="off" min="0" max="9999999999" step="1" class="input-amount buysaito-input" id="receive-saito-input" value="${receive_amount}" placeholder="0">
      </div>

      <div class="saito-button-row auto-size">
        <button id="next-purchase-btn" class="saito-button-primary">Buy</button>
      </div>
    </div>
  `;
};
