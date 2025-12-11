module.exports = (app, mod, self) => {
  let cryptos_list = self.available_cryptos
    .map((ticker) => {
      let id = (ticker || '').toLowerCase();
      let val = id;
      let lbl = (ticker || '').toUpperCase();
      return `
        <div class="purchase-crypto-item" id="${id}">
          <input type="radio" name="purchase-crypto" class="purchase-crypto" value="${val}">
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
