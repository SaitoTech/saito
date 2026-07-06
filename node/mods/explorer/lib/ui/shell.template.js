module.exports = () => {
	return `
    <div class="explorer-page">
      <div class="explorer-utility-bar">
        <div class="explorer-container explorer-utility-inner">
          <div class="explorer-search"></div>
        </div>
      </div>

      <div class="explorer-view explorer-view-root"></div>

      <footer class="explorer-footer">
        <div class="explorer-container explorer-footer-inner">
          <span>Explorer — Saito Blockchain Explorer</span>
          <a href="/explorer/supply" class="explorer-link explorer-footer-link">Token Supply</a>
        </div>
      </footer>
    </div>
  `;
};
