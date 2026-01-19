module.exports = (app, mod, self) => {
  let html = `
    <div class="payment-box">

      <div class='saito-purchase-deposit-header'>Awaiting Payment</div>

      <div class="price">
        ${app.browser.formatDecimals(self.expected_deposit)} ${self.crypto_selected.ticker}
      </div>

      <div class="pqrcode qrcode" id="pqrcode"></div>

      <div class="pubkey-containter" title="${self.destination}">
         <div class="profile-public-key" id="profile-public-key">`;

  if (self.destination.length > 28) {
    html += self.destination.slice(0, 8) + '...' + self.destination.slice(-8);
  } else {
    html += self.destination;
  }

  html += `</div>
         <i class="fas fa-copy"></i>
      </div>

      <div class="details">
        <div class="product-desc">${self.description || `Purchase ${app.browser.formatDecimals(self.amount)} SAITO`}</div>
      </div>

      <div class="instructions">
        Reserved for <span class="timer monospace">30:00</span>
      </div>

      <div class="help"> any problems? <span class="support-email">support@saito.io</span></div>

      <div class="saito-button-row">
        <button class="saito-button-secondary">Cancel</button>
        <button class="saito-button-primary">Done</button>
      </div>
    </div>
  `;

  return html;
};
