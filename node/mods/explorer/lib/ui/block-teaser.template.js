const BlockCardTemplate = require('./block-card.template');

module.exports = ({
  blocks = [],
  loading = false,
  error = null,
  loadingMessage = 'Fetching block data…'
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
    body = blocks.map((block) => BlockCardTemplate(block)).join('');
  }

  return `
    <section class="block-teaser explorer-panel" aria-label="Latest blocks">
      <div class="explorer-panel-header">
        <h2 class="explorer-heading explorer-m-0">
          <a class="explorer-link" href="/explorer/blocks" data-explorer-nav="all-blocks">Latest Blocks</a>
        </h2>
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
