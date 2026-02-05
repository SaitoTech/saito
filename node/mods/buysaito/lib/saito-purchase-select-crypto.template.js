module.exports = (app, mod, self) => {
  let cryptos_list = mod.available_currencies
    .map((currency) => {
      let lbl = (currency.ticker || '').toUpperCase();
      let url = currency.icon_url || `/${lbl.toLowerCase()}/img/logo.png`;

      return `
        <div class="purchase-crypto-item" id="${lbl}">
          <div>${lbl}</div>
          <img class="crypto-logo" src="${url}">
        </div>
      `;
    })
    .join('');

  return `
    <div class="purchase-container saito-overlay-size" id="purchase-container">
      <h3 class="purchase-select-crypto-msg">Select Payment Method</h3>
      <div class="purchase-crypto-list">
        ${cryptos_list}
      </div>
      <div class="footer-note">Already have (ERC-20 wrapped) SAITO? Visit our <a href="/migration">migration portal</a></div>
    </div>
  `;
};
