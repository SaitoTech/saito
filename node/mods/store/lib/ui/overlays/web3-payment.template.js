module.exports = (app, view = {}) => {
  const escape = (value) => app.browser.escapeHTML(String(value ?? ''));
  const processing = view.processing === true;
  const destination = String(view.destination || '');
  const lead = view.statusLead || 'This screen will update when your payment is detected.';

  return `
    <div class="store-web3-payment saito-overlay-panel saito-overlay-size${processing ? ' is-processing' : ''}">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Make Payment</h2>
      </header>

      <div class="price">${escape(view.amountLabel || '')}</div>

      ${
        view.canPayFromWallet
          ? `
        <button type="button" id="store-web3-pay" class="saito-button-primary" ${processing ? 'disabled' : ''}>
          Pay from Wallet Balance (${escape(view.walletBalanceLabel || '')})
        </button>
        <div class="instructions">Or send payment to:</div>
      `
          : ''
      }

      ${
        destination
          ? `
        <div class="qrcode" id="store-web3-qrcode"></div>
        <div class="address" title="${escape(destination)}">
          <div class="value">${escape(destination)}</div>
          <i class="fas fa-copy"></i>
        </div>
      `
          : ''
      }

      <div class="details">
        <div class="product-desc">${escape(view.productLabel || 'Purchase')}</div>
      </div>

      <div class="payment-status" role="status">
        <p>${escape(lead)}</p>
        <p>Need support? Email <a href="mailto:info@saito.io">info@saito.io</a> for assistance.</p>
      </div>
      ${
        processing
          ? `<div class="payment-processing" role="status" aria-live="polite">
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
