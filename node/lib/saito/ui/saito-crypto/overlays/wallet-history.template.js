module.exports = (mod, explorerUrl = '') => {
  const balanceHeader =
    mod.ticker === 'SAITO' ? '' : '<div class="saitox-header-item">Balance</div>';

  let html = `
    <div class="wallet-history">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Recent Transactions</h2>
        <button type="button" class="saito-button-square refresh" id="wallet-history-refresh" aria-label="Refresh recent transactions" title="Refresh recent transactions">
          <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
        </button>
      </header>

      <section class="transaction-history">
        <div class="transaction-history-table saitox-table" data-crypto="${mod.ticker}">
          <div class="saitox-header-item">Time</div>
          <div class="saitox-header-item">Type</div>
          <div class="saitox-header-item">Amount</div>
          ${balanceHeader}
          <div class="saitox-header-item">To/From</div>
          <div class="saitox-header-item saito-only">Memo</div>
        </div>
      </section>
  `;

  if (explorerUrl) {
    html += `
      <footer class="actions">
        <a class="saito-button-secondary" href="${explorerUrl}" id="wallet-history-explorer">
          View on Explorer
        </a>
      </footer>
    `;
  }

  html += `
    </div>
  `;

  return html;
};
