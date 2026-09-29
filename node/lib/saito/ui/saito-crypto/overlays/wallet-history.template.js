module.exports = (mod) => {
  const balanceHeader =
    mod.ticker === 'SAITO' ? '' : '<div class="saitox-header-item">Balance</div>';
  const refreshButton =
    mod.ticker === 'SAITO'
      ? ''
      : `<button type="button" class="saito-button-square refresh" id="wallet-history-refresh" aria-label="Refresh recent transactions" title="Refresh recent transactions">
          <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
        </button>`;

  return `
    <div class="wallet-history">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Recent Transactions</h2>
        ${refreshButton}
      </header>

      <section class="transaction-history">
        <div class="transaction-history-table saitox-table" data-crypto="${mod.ticker}">
          <div class="saitox-header-item">Time</div>
          <div class="saitox-header-item">Type</div>
          <div class="saitox-header-item crypto-amount">Amount</div>
          ${balanceHeader}
          <div class="saitox-header-item">To/From</div>
          <div class="saitox-header-item saito-only">Memo</div>
          <div class="saitox-header-item saito-only"></div>
        </div>
      </section>
    </div>
  `;
};
