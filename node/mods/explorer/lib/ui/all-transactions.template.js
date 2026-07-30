const TransactionCardTemplate = require('./transaction-card.template');

module.exports = ({
  transactions = [],
  loading = false,
  loadingMore = false,
  hasMore = true,
  error = null
} = {}) => {
  let rows = '';

  if (error) {
    rows = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load transactions</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
  } else if (loading && !transactions.length) {
    rows = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">Loading transactions from the network…</p>
      </div>
    `;
  } else if (!transactions.length) {
    rows = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">No transactions available yet.</p>
      </div>
    `;
  } else {
    rows = transactions.map((tx) => TransactionCardTemplate(tx, { showModule: true })).join('');
  }

  const loadMoreHtml = loadingMore
    ? '<div class="explorer-load-more"><span class="explorer-load-more-text">Loading more transactions…</span></div>'
    : hasMore && transactions.length
      ? '<div class="explorer-load-more"><button type="button" class="explorer-load-more-btn">Load more transactions</button></div>'
      : '';

  return `
    <main class="explorer-content explorer-view-panel">
      <div class="explorer-container explorer-stack">
        <div class="explorer-block-header">
          <button type="button" class="explorer-back-link" data-explorer-nav="home" aria-label="Back to Explorer">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="explorer-block-header-text">
            <h1 class="explorer-page-title">All Transactions</h1>
          </div>
        </div>
        <section class="explorer-panel" aria-label="All transactions">
          <div class="explorer-feed explorer-all-tx-feed">
            ${rows}
          </div>
          ${loadMoreHtml}
        </section>
      </div>
    </main>
  `;
};
