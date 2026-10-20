function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({
  title = '',
  value = '',
  multiline = false,
  inputType = 'text',
  placeholder = '',
  tickers = null,
  ticker = 'SAITO'
} = {}) => {
  const safeTitle = escapeHtml(title);
  const safeValue = escapeHtml(value);
  const safePlaceholder = escapeHtml(placeholder);
  const selected = String(ticker || 'SAITO').trim().toUpperCase() || 'SAITO';
  const tickerList = Array.isArray(tickers)
    ? tickers.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : null;

  const amount = `<input id="saito-overlay-form-input" class="saito-input text-input" type="${inputType}" value="${safeValue}" placeholder="${safePlaceholder}" />`;
  const tickerSelect =
    tickerList && tickerList.length
      ? `<select id="saito-overlay-form-ticker" class="saito-input ticker" data-field="ticker" aria-label="Price ticker">${tickerList
          .map(
            (item) =>
              `<option value="${escapeHtml(item)}"${item === selected ? ' selected' : ''}>${escapeHtml(item)}</option>`
          )
          .join('')}</select>`
      : '';

  const field = multiline
    ? `<textarea id="saito-overlay-form-input" class="saito-textarea text-input" rows="6" placeholder="${safePlaceholder}">${safeValue}</textarea>`
    : tickerSelect
      ? `<div class="price-row">${amount}${tickerSelect}</div>`
      : amount;

  return `
    <form class="saito-overlay-form store-listing-field-edit">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">${safeTitle}</div>
      </div>
      ${field}
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary" data-action="cancel">Cancel</button>
        <button type="submit" class="saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Save</button>
      </div>
    </form>
  `;
};
