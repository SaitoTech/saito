module.exports = (app, mod, self) => {
  if (!self.addr_obj) {
    throw new Error('No Address object');
    return;
  }

  let html = `
    <div class="payment-box">

      <div class='saito-purchase-deposit-header'>Awaiting Payment</div>

      <div class="price">
        ${app.browser.formatDecimals(self.expected_deposit)} ${self.addr_obj.ticker}
      </div>

      <div class="pqrcode qrcode" id="pqrcode"></div>

      <div class="pubkey-containter" title="${self.addr_obj.address}">
         <div class="profile-public-key" id="profile-public-key">`;

  if (self.addr_obj.address.length > 28) {
    html += self.addr_obj.address.slice(0, 8) + '...' + self.addr_obj.address.slice(-8);
  } else {
    html += self.addr_obj.address;
  }

  html += `</div>
         <i class="fas fa-copy"></i>
      </div>

      <div class="details">
        <div class="product-desc">${self.description}</div>
        <div class='exchange-rate'>@ 1 SAITO ~ ${app.browser.formatDecimals(self.convertToSaito(1))} ${self.addr_obj.ticker}</div>
      </div>

      <div class="instructions">
        Reserved for <span class="timer">30:00</span>. <br> <span class="extend-timer" id="extend-timer">Need more time?</span>.
      </div>

      <div class="help"> any problems? <span class="support-email">support@saito.io</span></div>

    </div>
  `;

  return html;
};
