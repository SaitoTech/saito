module.exports = (app, mod, self) => {
  let cryptos_list = mod.available_currencies
    .map((currency) => {
      let lbl = (currency.ticker || '').toUpperCase();
      return `
        <div class="purchase-crypto-item" id="${lbl}">
          <div>${lbl}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="purchase-container" id="purchase-container">
      <h3 class="purchase-select-crypto-msg">Select Payment Method</h3>
      <div class="purchase-crypto-list">
        ${cryptos_list}
      </div>
    </div>
  `;
};
