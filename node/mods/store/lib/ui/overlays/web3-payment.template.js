module.exports = (app, view = {}) => {
  const escape = (value) => app.browser.escapeHTML(String(value ?? ''));
  const processing = view.processing === true;
  const fundsNotice = view.fundsNotice === true;
  const destination = fundsNotice ? '' : String(view.destination || '');
  const lead = view.statusLead || 'this screen will update when your payment is detected';
  const support = `<a href="mailto:info@saito.io">info@saito.io</a>`;

  return `
    <div class="store-web3-payment saito-overlay-panel saito-overlay-size${processing ? ' is-processing' : ''}">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Make Payment</h2>
      </header>

      <div class="price">${escape(view.amountLabel || '')}</div>

      ${
        !fundsNotice && view.canPayFromWallet
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

      ${
        fundsNotice
          ? `<div class="funds-notice" role="status">
        <h3>Technical Issues -- Please be Patient</h3>
        <p>Our server is having an issue completing this order automatically. Your payment is safe and our team has been notified of this problem. The issue should be fixed shortly, at which point your order will complete.</p>
        ${
          view.followupSent
            ? `<p class="funds-notice-sent">We'll email ${escape(view.followupEmail || '')} when this order completes.</p>`
            : `<form class="funds-notice-form">
          <input id="store-web3-followup-email" class="saito-input" type="email" name="email" placeholder="email" autocomplete="email" required />
          <button type="submit" class="saito-button-primary">submit</button>
        </form>
        ${view.followupError ? `<p class="funds-notice-error">${escape(view.followupError)}</p>` : ''}`
        }
        <p>If you'd like an email when the problem is resolved, please provide one above and we'll contact you. Otherwise please be patient while we complete your order. You can email us anytime at ${support}.</p>
      </div>`
          : `<div class="payment-status" role="status">
        <p>${escape(lead)}</p>
        <p>need support? ${support} for assistance</p>
      </div>`
      }
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
