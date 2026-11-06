module.exports = () => `
  <main class="explorer-content explorer-chain">
    <div class="explorer-container explorer-stack">
      <div class="explorer-chain-toolbar">
        <h1 class="explorer-page-title">Chain &amp; forks</h1>
        <form data-chain-jump>
          <input name="block" aria-label="Block height or hash" placeholder="Height or block hash" required />
          <button type="submit">Go</button>
        </form>
        <button type="button" data-chain-action="latest">Latest</button>
        <button type="button" data-chain-action="refresh">Refresh</button>
      </div>
      <div class="explorer-chain-legend">
        <span class="canonical">● Canonical</span><span class="fork">● Side branch</span>
        <span class="unknown">● Status unknown</span>
        <span>Older ← drag to explore → Newer · scroll to zoom</span>
      </div>
      <div class="explorer-chain-stage" tabindex="0" role="region" aria-label="Blockchain. Arrow keys pan; plus and minus zoom.">
        <div class="explorer-chain-labels"></div>
        <div class="explorer-chain-tooltip" hidden></div>
      </div>
      <div class="explorer-chain-toolbar">
        <button type="button" data-chain-action="older">← Older</button>
        <button type="button" data-chain-action="newer">Newer →</button>
        <button type="button" data-chain-action="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" data-chain-action="zoom-out" aria-label="Zoom out">−</button>
        <p data-chain-status role="status" aria-live="polite"></p>
      </div>
      <section class="explorer-chain-detail explorer-panel" aria-label="Selected block">
        <p>Select a cube to inspect it. Blocks at the same height share a column.</p>
      </section>
      <details class="explorer-chain-list"><summary>Blocks in view / keyboard navigation</summary>
        <div data-chain-list></div>
      </details>
    </div>
  </main>`;
