module.exports = ({
  blocks = [],
  loading = false,
  loadingMore = false,
  hasMore = true,
  error = null
} = {}) => {
  let rows = '';

  if (error) {
    rows = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load blocks</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
  } else if (loading && !blocks.length) {
    rows = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">Loading blocks from the network…</p>
      </div>
    `;
  } else if (!blocks.length) {
    rows = `
      <div class="explorer-teaser-loading">
        <p class="explorer-teaser-loading-message">No blocks available yet.</p>
      </div>
    `;
  } else {
    rows = blocks
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

  const loadMoreHtml = loadingMore
    ? '<div class="explorer-load-more"><span class="explorer-load-more-text">Loading more blocks…</span></div>'
    : hasMore && blocks.length
      ? '<div class="explorer-load-more"><button type="button" class="explorer-load-more-btn">Load more blocks</button></div>'
      : '';

  return `
    <main class="explorer-content explorer-view-panel">
      <div class="explorer-container explorer-stack">
        <div class="explorer-block-header">
          <button type="button" class="explorer-back-link" data-explorer-nav="home" aria-label="Back to Explorer">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="explorer-block-header-text">
            <h1 class="explorer-page-title">All Blocks</h1>
          </div>
        </div>
        <section class="explorer-panel" aria-label="All blocks">
          <div class="explorer-feed explorer-all-blocks-feed">
            ${rows}
          </div>
          ${loadMoreHtml}
        </section>
      </div>
    </main>
  `;
};
