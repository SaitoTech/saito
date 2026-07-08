module.exports = ({ transactions = [], loading = false, loadingMore = false, hasMore = true, error = null } = {}) => {
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
		rows = transactions
			.map(
				(tx) => `
      <div class="explorer-feed-item explorer-all-tx-row" role="button" tabindex="0" data-tx-signature="${tx.signature}" data-block-hash="${tx.blockHash}" data-block-id="${tx.blockId}">
        <span class="explorer-feed-icon" aria-hidden="true"><i class="fas fa-file-alt"></i></span>
        <div class="explorer-feed-main">
          <div class="explorer-feed-line">
            <span class="explorer-link explorer-mono explorer-truncate">${tx.hash}</span>
            <span class="explorer-tx-type-badge explorer-tx-type-badge-subtle">${tx.module}</span>
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
