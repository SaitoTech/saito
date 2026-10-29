module.exports = (app, data = {}) => `
  <div class="buysaito-payment-box buysaito-payment-complete saito-overlay-panel saito-overlay-size narrow" role="status">
    <h2 class="saito-purchase-deposit-header">${data.received_amount ? `${app.browser.escapeHTML(app.browser.formatDecimals(data.received_amount, true))} SAITO Received` : 'SAITO sent'}</h2>
    ${data.received_amount ? '' : '<p class="buysaito-receipt-subtitle">The SAITO transaction has been confirmed on chain.</p>'}
    ${
      data.paid
        ? `
      <div class="txsig">
        <h3 class="sig-header">Transaction signature</h3>
        <div class="sig monospace">${app.browser.escapeHTML(data.paid)}</div>
      </div>`
        : ''
    }
  </div>
`;
