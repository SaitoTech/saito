module.exports = (app, mod, self) => {
  return `
    <style>

    #deposit-container {
      background: var(--saito-background-color);
      display: flex;
      height: fit-content;
      width: 75rem;
      justify-content: space-between;
      padding: 5rem;
      font-size: 2rem;
    }

    .deposit-address-main {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    </style>

    <div class="" id="deposit-container">

      <div class="deposit-heading">
        Deposit <b>${app.browser.formatDecimals(self.amount)} ${self.ticker}</b>
      </div>

      <div class="deposit-address-main">
        <div id="deposit-address">${self.address}</div>
        <div id="deposit-qrcode"></div>
      </div>
    </div>
  `;
};
