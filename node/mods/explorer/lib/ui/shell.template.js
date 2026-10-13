module.exports = () => {
  return `
    <div class="explorer-page">
      <div class="explorer-utility-bar">
        <div class="explorer-container explorer-utility-inner">
          <div class="explorer-search"></div>
          <div class="explorer-simulation-status" data-explorer-simulation-status aria-live="polite"></div>
        </div>
      </div>

      <div class="explorer-view explorer-view-root"></div>

      <footer class="explorer-footer">
        <div class="explorer-container explorer-footer-inner">
          <span>Explorer — Saito Blockchain Explorer</span>
        </div>
      </footer>
    </div>
  `;
};
