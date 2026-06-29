module.exports = () => {
	return `
    <div class="newsplorer-page">
      <div class="newsplorer-utility-bar">
        <div class="newsplorer-container newsplorer-utility-inner">
          <div class="newsplorer-utility-start">
            <span class="newsplorer-ticker">SAITO Price: <strong>$0.42</strong> (+1.20%)</span>
          </div>
          <div class="newsplorer-utility-end">
            <div class="newsplorer-search"></div>
          </div>
        </div>
      </div>

      <main class="newsplorer-content">
        <div class="newsplorer-container newsplorer-stack">
          <h1 class="newsplorer-page-title">The Saito Blockchain Explorer</h1>
          <div class="newsplorer-dashboard"></div>
          <div class="newsplorer-columns">
            <div class="newsplorer-blocks"></div>
            <div class="newsplorer-transactions"></div>
          </div>
        </div>
      </main>

      <footer class="newsplorer-footer">
        <div class="newsplorer-container">
          <span>Newsplorer — Saito Blockchain Explorer</span>
        </div>
      </footer>
    </div>
  `;
};
