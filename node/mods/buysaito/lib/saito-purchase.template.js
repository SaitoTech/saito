module.exports = (app, mod, self) => {
  const explorer = mod.returnPaymentAddressExplorer(self.crypto_selected, self.destination);
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

      <div class="instructions" role="status">
        This screen will update automatically when your payment is detected.
      </div>

      <details class="help">
        <summary>Help</summary>
        <div class="help-content">
          <a class="support-email" href="mailto:support@saito.io">support@saito.io</a>
          ${
            explorer
              ? `<a href="${explorer}" target="_blank" rel="noopener noreferrer">check transactions to payment address</a>`
              : '<span>Address explorer unavailable for this network.</span>'
          }
        </div>
      </details>
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
