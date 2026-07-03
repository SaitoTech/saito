module.exports = ({
	blocks = [],
	loading = false,
	error = null,
	loadingMessage = 'Fetching block data…',
} = {}) => {
	let body = '';

	if (loading) {
		body = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-title">Fetching block data</p>
        <p class="explorer-teaser-loading-message">${loadingMessage}</p>
      </div>
    `;
	} else if (error) {
		body = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load blocks</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
	} else if (!blocks.length) {
		body = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">No blocks available yet.</p>
      </div>
    `;
	} else {
		body = blocks
			.map(
				(block) => `
      <div class="explorer-feed-item" role="button" tabindex="0" data-block-hash="${block.hash}">
        <span class="explorer-feed-icon" aria-hidden="true"><i class="fas fa-cube"></i></span>
        <div class="explorer-feed-main">
          <div class="explorer-feed-line">
            <span class="explorer-link">Block ${block.number}</span>
          </div>
          <div class="explorer-feed-meta">
            Miner ${block.miner}
          </div>
        </div>
        <div class="explorer-feed-aside">
          <span class="explorer-feed-time">${block.time}</span>
          <span class="explorer-feed-detail">${block.txns} txns</span>
        </div>
        <span class="explorer-feed-badge">${block.reward}</span>
      </div>
    `
			)
			.join('');
	}

	return `
    <section class="block-teaser explorer-panel" aria-label="Latest blocks">
      <div class="explorer-panel-header">
        <h2 class="explorer-heading explorer-m-0">Latest Blocks</h2>
      </div>
      <div class="explorer-feed">
        ${body}
      </div>
      <div class="explorer-panel-footer">
        <a class="explorer-link" href="/explorer/blocks" data-explorer-nav="all-blocks">View all blocks</a>
      </div>
    </section>
  `;
};
