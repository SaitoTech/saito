module.exports = ({ transactions = [] } = {}) => {
	const rows = transactions
		.map(
			(tx) => `
      <a class="newsplorer-feed-item" href="#">
        <span class="newsplorer-feed-icon" aria-hidden="true"><i class="fas fa-file-alt"></i></span>
        <div class="newsplorer-feed-main">
          <div class="newsplorer-feed-title">
            <span class="newsplorer-link newsplorer-mono newsplorer-truncate">TX# ${tx.hash}</span>
            <span class="newsplorer-feed-time">${tx.time}</span>
          </div>
          <div class="newsplorer-feed-meta">
            From <span class="newsplorer-link">${tx.from}</span>
          </div>
          <div class="newsplorer-feed-detail">
            To <span class="newsplorer-link">${tx.to}</span>
          </div>
        </div>
        <div class="newsplorer-feed-side">
          <span class="newsplorer-feed-badge">${tx.amount}</span>
        </div>
      </a>
    `
		)
		.join('');

	return `
    <section class="newsplorer-transactions-component newsplorer-panel" aria-label="Latest transactions">
      <div class="newsplorer-panel-header">
        <h2 class="newsplorer-heading newsplorer-m-0">Latest Transactions</h2>
      </div>
      <div class="newsplorer-feed newsplorer-transactions-feed">
        ${rows}
      </div>
      <div class="newsplorer-panel-footer">
        <a class="newsplorer-link" href="#">View all transactions</a>
      </div>
    </section>
  `;
};
