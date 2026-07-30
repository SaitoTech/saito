module.exports = () => {
  return `
    <main class="explorer-content explorer-view-panel">
      <div class="explorer-container explorer-stack">
        <div class="explorer-block-header">
          <button type="button" class="explorer-back-link" data-explorer-refresh aria-label="Refresh explorer">
            <i class="fas fa-refresh" aria-hidden="true"></i>
          </button>
          <div class="explorer-block-header-text">
            <h1 class="explorer-page-title">The Saito Blockchain Explorer</h1>
          </div>
        </div>
        <div class="explorer-dashboard"></div>
        <div class="explorer-columns">
          <div class="block-teaser"></div>
          <div class="transaction-teaser"></div>
        </div>
      </div>
    </main>
  `;
};
