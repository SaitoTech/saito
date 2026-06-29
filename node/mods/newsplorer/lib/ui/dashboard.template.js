module.exports = ({ stats = {} } = {}) => {
	const price = stats.price || {};
	const marketCap = stats.marketCap || {};
	const transactions = stats.transactions || {};
	const fee = stats.fee || {};
	const finalized = stats.finalized || {};
	const safe = stats.safe || {};

	return `
    <section class="newsplorer-dashboard-component" aria-label="Network statistics">
      <div class="newsplorer-dashboard-grid">
        <div class="newsplorer-card newsplorer-dashboard-card">
          <div class="newsplorer-dashboard-split">
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${price.label || 'Saito Price'}</div>
              <div class="newsplorer-stat-value">${price.value || ''}</div>
              ${price.sub ? `<div class="newsplorer-stat-sub">${price.sub}</div>` : ''}
            </div>
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${marketCap.label || 'Market Cap'}</div>
              <div class="newsplorer-stat-value">${marketCap.value || ''}</div>
            </div>
          </div>
        </div>

        <div class="newsplorer-card newsplorer-dashboard-card">
          <div class="newsplorer-dashboard-quad">
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${transactions.label || 'Transactions'}</div>
              <div class="newsplorer-stat-value">${transactions.value || ''}</div>
              ${transactions.sub ? `<div class="newsplorer-stat-sub">${transactions.sub}</div>` : ''}
            </div>
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${fee.label || 'Med Fee Price'}</div>
              <div class="newsplorer-stat-value">${fee.value || ''}</div>
              ${fee.sub ? `<div class="newsplorer-stat-sub">${fee.sub}</div>` : ''}
            </div>
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${finalized.label || 'Last Finalized Block'}</div>
              <div class="newsplorer-stat-value">${finalized.value || ''}</div>
            </div>
            <div class="newsplorer-stat">
              <div class="newsplorer-stat-label">${safe.label || 'Last Safe Block'}</div>
              <div class="newsplorer-stat-value">${safe.value || ''}</div>
            </div>
          </div>
        </div>

        <div class="newsplorer-card newsplorer-dashboard-card newsplorer-dashboard-chart">
          <div class="newsplorer-stat-label">Transaction History in 14 days</div>
          <div class="newsplorer-chart-placeholder" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </section>
  `;
};
