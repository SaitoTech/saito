const TransactionCardTemplate = require('./transaction-card.template');

module.exports = ({
  transactions = [],
  loading = false,
  error = null,
  loadingMessage = 'Fetching transaction data…'
} = {}) => {
  let body = '';

  if (loading) {
    body = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-title">Fetching transaction data</p>
        <p class="explorer-teaser-loading-message">${loadingMessage}</p>
      </div>
    `;
  } else if (error) {
    body = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load transactions</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
  } else if (!transactions.length) {
    body = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">No transactions available yet.</p>
      </div>
    `;
  } else {
    body = transactions.map((tx) => TransactionCardTemplate(tx)).join('');
  }

  return `
    <section class="transaction-teaser explorer-panel" aria-label="Latest transactions">
      <div class="explorer-panel-header">
        <h2 class="explorer-heading explorer-m-0">
          <a class="explorer-link" href="/explorer/transactions" data-explorer-nav="all-transactions">Latest Transactions</a>
        </h2>
      </div>
      <div class="explorer-feed transaction-teaser-feed">
        ${body}
      </div>
      <div class="explorer-panel-footer">
        <a class="explorer-link" href="/explorer/transactions" data-explorer-nav="all-transactions">View all transactions</a>
      </div>
    </section>
  `;
};
