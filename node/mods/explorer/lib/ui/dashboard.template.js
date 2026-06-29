module.exports = ({ stats = {} } = {}) => {
	const price = stats.price || {};
	const marketCap = stats.marketCap || {};
	const transactions = stats.transactions || {};
	const fee = stats.fee || {};
	const finalized = stats.finalized || {};
	const safe = stats.safe || {};

	return `
    <section class="explorer-dashboard-component" aria-label="Network statistics">
      <div class="explorer-dashboard-grid">
        <div class="explorer-card explorer-dashboard-card">
          <div class="explorer-dashboard-split">
            <div class="explorer-stat">
              <div class="explorer-stat-label">${price.label || 'Saito Price'}</div>
              <div class="explorer-stat-value">${price.value || ''}</div>
              ${price.sub ? `<div class="explorer-stat-sub">${price.sub}</div>` : ''}
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${marketCap.label || 'Market Cap'}</div>
              <div class="explorer-stat-value">${marketCap.value || ''}</div>
            </div>
          </div>
        </div>

        <div class="explorer-card explorer-dashboard-card">
          <div class="explorer-dashboard-quad">
            <div class="explorer-stat">
              <div class="explorer-stat-label">${transactions.label || 'Transactions'}</div>
              <div class="explorer-stat-value">${transactions.value || ''}</div>
              ${transactions.sub ? `<div class="explorer-stat-sub">${transactions.sub}</div>` : ''}
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${fee.label || 'Med Fee Price'}</div>
              <div class="explorer-stat-value">${fee.value || ''}</div>
              ${fee.sub ? `<div class="explorer-stat-sub">${fee.sub}</div>` : ''}
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${finalized.label || 'Last Finalized Block'}</div>
              <div class="explorer-stat-value">${finalized.value || ''}</div>
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${safe.label || 'Last Safe Block'}</div>
              <div class="explorer-stat-value">${safe.value || ''}</div>
            </div>
          </div>
        </div>

        <div class="explorer-card explorer-dashboard-card explorer-dashboard-chart">
          <div class="explorer-stat-label">Transaction History in 14 days</div>
          <div class="explorer-chart-placeholder" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </section>
  `;
};
