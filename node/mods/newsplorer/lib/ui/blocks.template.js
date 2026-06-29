module.exports = ({ blocks = [] } = {}) => {
	const rows = blocks
		.map(
			(block) => `
      <a class="newsplorer-feed-item" href="#">
        <span class="newsplorer-feed-icon" aria-hidden="true"><i class="fas fa-cube"></i></span>
        <div class="newsplorer-feed-main">
          <div class="newsplorer-feed-title">
            <span class="newsplorer-link">Block ${block.number}</span>
            <span class="newsplorer-feed-time">${block.time}</span>
          </div>
          <div class="newsplorer-feed-meta">
            Miner <span class="newsplorer-link">${block.miner}</span>
          </div>
          <div class="newsplorer-feed-detail">
            ${block.txns} txns in ${block.duration}
          </div>
        </div>
        <div class="newsplorer-feed-side">
          <span class="newsplorer-feed-badge">${block.reward}</span>
        </div>
      </a>
    `
		)
		.join('');

	return `
    <section class="newsplorer-blocks-component newsplorer-panel" aria-label="Latest blocks">
      <div class="newsplorer-panel-header">
        <h2 class="newsplorer-heading newsplorer-m-0">Latest Blocks</h2>
      </div>
      <div class="newsplorer-feed">
        ${rows}
      </div>
      <div class="newsplorer-panel-footer">
        <a class="newsplorer-link" href="#">View all blocks</a>
      </div>
    </section>
  `;
};
