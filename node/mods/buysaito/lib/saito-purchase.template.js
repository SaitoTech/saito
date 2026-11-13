module.exports = (app, mod, self) => {
  const processing = self.internal_payment_pending;
  return `
    <div class="buysaito-payment-box saito-overlay-panel saito-overlay-size${processing ? ' buysaito-payment-processing' : ''}">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Awaiting Payment</h2>
      </header>

      <div class="price">
        ${app.browser.formatDecimals(self.expected_deposit, true)} ${self.crypto_selected.ticker}
      </div>

      ${
        self.canPayFromWallet()
          ? `
        <button type="button" id="pay-from-wallet-btn" class="saito-button-primary" ${processing ? 'disabled' : ''}>
          Pay from Wallet Balance (${app.browser.formatDecimals(self.crypto_selected.available_balance, true)} ${self.crypto_selected.ticker})
        </button>
        <div class="instructions">Or send payment to:</div>
      `
          : ''
      }

      <div class="pqrcode qrcode" id="pqrcode"></div>

      <div class="pubkey-container" title="${self.destination}">
        <div class="profile-public-key" id="profile-public-key">${self.destination}</div>
        <i class="fas fa-copy"></i>
      </div>

      <div class="details">
        <div class="product-desc">${self.description || `Purchase ${app.browser.formatDecimals(self.amount, true)} SAITO`}</div>
      </div>

      <div class="payment-status" role="status">
        <p>This screen will update when your payment is detected.</p>
        <p>Need support? Email <a href="mailto:info@saito.io">info@saito.io</a> for assistance.</p>
      </div>
      ${
        processing
          ? `<div class="payment-processing-overlay" role="status" aria-live="polite">
              <div class="payment-processing-status">
                <div class="saito-spinner" aria-hidden="true"></div>
                <p>Payment processing...</p>
              </div>
            </div>`
          : ''
      }
    </div>
  `;
};
