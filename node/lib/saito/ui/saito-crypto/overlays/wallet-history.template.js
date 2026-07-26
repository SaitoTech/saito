module.exports = (mod, explorerUrl = '') => {
  let html = `
    <div class="wallet-history">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Transaction History</h2>
        <button class="saito-button-secondary small refresh" id="wallet-history-refresh">
          <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
          <span>Refresh</span>
        </button>
      </header>

      <section class="transaction-history">
        <div class="transaction-history-table saitox-table" data-crypto="${mod.ticker}">
          <div class="saitox-header-item">Time</div>
          <div class="saitox-header-item">Type</div>
          <div class="saitox-header-item">Amount</div>
          <div class="saitox-header-item">Balance</div>
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
