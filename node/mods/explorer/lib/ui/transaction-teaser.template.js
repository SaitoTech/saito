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
    body = transactions
      .map(
        (tx) => `
      <div class="explorer-feed-item" role="button" tabindex="0" data-tx-signature="${tx.signature}" data-block-hash="${tx.blockHash}" data-block-id="${tx.blockId}">
        <span class="explorer-feed-icon" aria-hidden="true"><i class="fas fa-file-alt"></i></span>
        <div class="explorer-feed-main">
          <div class="explorer-feed-line">
            <span class="explorer-link explorer-mono explorer-truncate">${tx.hash}</span>
          </div>
          <div class="explorer-feed-meta">
            From ${tx.from}
          </div>
        </div>
        <div class="explorer-feed-aside">
          <span class="explorer-feed-time">${tx.time}</span>
          <span class="explorer-feed-detail">To ${tx.to}</span>
        </div>
        <span class="explorer-feed-badge">${tx.amount}</span>
      </div>
    `
      )
      .join('');
  }

  return `
    <section class="transaction-teaser explorer-panel" aria-label="Latest transactions">
      <div class="explorer-panel-header">
        <h2 class="explorer-heading explorer-m-0">Latest Transactions</h2>
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
