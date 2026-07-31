const BlockCardTemplate = require('./block-card.template');

module.exports = ({
  blocks = [],
  loading = false,
  loadingMore = false,
  hasMore = true,
  error = null,
  autoRefresh = false,
  showForkBlocks = false,
  newBlockHash = null
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
      .map((block) =>
        BlockCardTemplate(block, {
          showDetails: showForkBlocks,
          showLongestChain: showForkBlocks,
          isNew: newBlockHash === block.hash
        })
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
        <div class="explorer-block-header explorer-block-list-header">
          <button type="button" class="explorer-back-link" data-explorer-nav="home" aria-label="Back to Explorer">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="explorer-block-header-text">
            <h1 class="explorer-page-title">Blocks</h1>
          </div>
          <div class="explorer-block-controls">
            <label class="explorer-block-control">
              <input type="checkbox" data-explorer-auto-refresh${autoRefresh ? ' checked' : ''}>
              <span>Auto refresh</span>
            </label>
            <label class="explorer-block-control">
              <input type="checkbox" data-explorer-show-forks${showForkBlocks ? ' checked' : ''}>
              <span>Show all blocks</span>
            </label>
          </div>
        </div>
        <section class="explorer-panel" aria-label="Blocks">
          <div class="explorer-feed explorer-all-blocks-feed">
            ${rows}
          </div>
          ${loadMoreHtml}
        </section>
      </div>
    </main>
  `;
};
