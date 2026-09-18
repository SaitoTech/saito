module.exports = (app, mod, self, { inline = false } = {}) => {
  const currencies = mod.available_currencies || [];
  const data = currencies.find((currency) => currency.ticker === self.crypto_selected?.ticker);
  const prefix = inline ? 'buy-page-' : '';
  const disabled = data ? '' : 'disabled';
  const logo = (currency) => {
    const result = app.modules.getRespondTos('crypto-logo', { ticker: currency.ticker }).shift();
    const img =
      result?.img || currency.icon_url || `/${currency.ticker.toLowerCase()}/img/logo.png`;
    return `<img class="crypto-logo" src="${img}" alt="">${
      result?.sub_logo ? `<img class="chain-logo" src="${result.sub_logo}" alt="">` : ''
    }`;
  };

  return `
    <div class="amount-selection-box${inline ? '' : ' saito-overlay-panel saito-overlay-size narrow'}">
      <div class="saito-purchase-deposit-header">Select Amount</div>
      <div class="crypto-box">
        <div class="amount-selection-logo">
          ${currencies.map((currency) => `<span class="payment-currency-logo" data-payment-logo="${currency.ticker}" ${currency.ticker === data?.ticker ? '' : 'hidden'}>${logo(currency)}</span>`).join('')}
        </div>
        <div class="buysaito-amount-field">
          <select id="${prefix}payment-currency" class="buysaito-currency-select" aria-label="Payment currency" ${disabled}>
            ${data ? currencies.map((currency) => `<option value="${currency.ticker}" ${currency.ticker === data.ticker ? 'selected' : ''}>${currency.ticker}</option>`).join('') : '<option>Currency</option>'}
          </select>
          <input type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" autocomplete="off" spellcheck="false" class="saito-input buysaito-input-amount" id="${prefix}input-amount" value="" required aria-label="Amount in ${data?.ticker || 'payment currency'}" placeholder="0" ${disabled}>
        </div>
      </div>
      <div class="crypto-box">
        <div class="amount-selection-logo">${logo({ ticker: 'SAITO', icon_url: '/saito/img/saito-icon.png' })}</div>
        <div class="buysaito-amount-field">
          <label for="${prefix}saito-input-amount" class="buysaito-currency-label">SAITO</label>
          <input type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" autocomplete="off" spellcheck="false" class="saito-input buysaito-input-amount expected_amount" id="${prefix}saito-input-amount" value="" required aria-label="Amount in SAITO" placeholder="0" ${disabled}>
        </div>
      </div>
      ${!data ? `<p role="status">${mod.available_currencies === null ? 'Service currently not available. Please try again later.' : 'Checking available payment currencies...'}</p>` : ''}
      <div class="saito-button-row auto-size">
        <button type="button" id="${prefix}next-purchase-btn" class="saito-button-primary" disabled>Next</button>
      </div>
    </div>
  `;
};
