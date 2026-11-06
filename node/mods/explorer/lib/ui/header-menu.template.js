module.exports = () => `
  <div class="explorer-header-menu">
    <button type="button" class="explorer-header-menu-toggle"
      aria-label="Explorer navigation" aria-expanded="false"
      aria-controls="explorer-header-navigation">
      <span aria-hidden="true"></span><span aria-hidden="true"></span>
    </button>
    <nav id="explorer-header-navigation" aria-label="Explorer" hidden>
      <a href="/explorer/chain" data-explorer-header-nav="chain">Chain &amp; forks</a>
      <a href="/explorer/supply" data-explorer-header-nav="supply">Token Supply</a>
      <a href="/explorer/holders" data-explorer-header-nav="holders">Holders &amp; UTXO Set</a>
    </nav>
  </div>
`;
