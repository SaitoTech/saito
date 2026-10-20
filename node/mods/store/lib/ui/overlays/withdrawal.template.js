function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({ ticker = '', available = '0' } = {}) => {
  const symbol = escapeHtml(ticker);
  return `
    <form class="saito-overlay-form store-withdrawal">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">Withdraw ${symbol}</div>
      </div>
      <p class="available"><span class="amount">${escapeHtml(available)}</span> available</p>
      <label class="address">
        <span>Withdrawal address</span>
        <input class="saito-input" type="text" name="address" autocomplete="off" spellcheck="false" aria-label="${symbol} withdrawal address" />
      </label>
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary" data-action="cancel">Cancel</button>
      </div>
    </form>
  `;
};
