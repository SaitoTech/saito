module.exports = () => {
	return `
    <div class="newsplorer-dashboard-component">
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">SAITO Price</div>
        <div class="newsplorer-stat-value">$0.1842</div>
        <div class="newsplorer-stat-sub positive">+2.14%</div>
      </div>
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">Market Cap</div>
        <div class="newsplorer-stat-value">$184.2M</div>
        <div class="newsplorer-stat-sub">on-chain supply</div>
      </div>
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">Latest Block</div>
        <div class="newsplorer-stat-value">
          <a href="#" class="newsplorer-link">2,847,193</a>
        </div>
        <div class="newsplorer-stat-sub">2 secs ago</div>
      </div>
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">Transactions</div>
        <div class="newsplorer-stat-value">142.8M</div>
        <div class="newsplorer-stat-sub">14.2 TPS (24h avg)</div>
      </div>
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">Avg Block Time</div>
        <div class="newsplorer-stat-value">2.01s</div>
        <div class="newsplorer-stat-sub">last 100 blocks</div>
      </div>
      <div class="newsplorer-stat-card">
        <div class="newsplorer-stat-label">Routing Work</div>
        <div class="newsplorer-stat-value">18.4M</div>
        <div class="newsplorer-stat-sub">network difficulty index</div>
      </div>
    </div>
  `;
};
