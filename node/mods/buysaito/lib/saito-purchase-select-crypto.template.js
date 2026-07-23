module.exports = (app, mod, self) => {
  let cryptos_list = mod.available_currencies
    .map((currency) => {
      let lbl = (currency.ticker || '').toUpperCase();

      let img = currency.icon_url || `/${currency.ticker.toLowerCase()}/img/logo.png`;

      let results = app.modules.getRespondTos('crypto-logo', { ticker: lbl }).shift();

      if (results?.img) {
        img = results?.img;
      }
      let logo = `<img class='crypto-logo' src='${img}'>`;
      if (results?.sub_logo) {
        logo += `<img class='chain-logo' src='${results?.sub_logo}'>`;
      }
      return `
        <div class="purchase-crypto-item" id="${lbl}">
          <div>${lbl}</div>
          <div class='purchase-crypto-logo-container'>${logo}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="purchase-container saito-overlay-panel saito-overlay-size wide" id="purchase-container">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Get Saito</h2>
      </header>
      <h3 class="purchase-select-crypto-msg">Choose Payment Method</h3>
      <div class="purchase-crypto-list">
        ${cryptos_list}
      </div>
      <div class="buysaito-footer-note">Already have (ERC-20 wrapped) SAITO? Visit our <a href="/migration">migration portal</a></div>
    </div>
  `;
};
