module.exports = () => {
	return `
    <div class="newsplorer-page">
      <header class="newsplorer-topbar">
        <div class="newsplorer-topbar-inner">
          <a class="newsplorer-brand" href="/newsplorer">
            <span class="newsplorer-brand-mark" aria-hidden="true"></span>
            <span class="newsplorer-brand-text">Saito Explorer</span>
          </a>
          <nav class="newsplorer-topnav" aria-label="Primary">
            <a href="#" class="newsplorer-topnav-link active">Home</a>
            <a href="#" class="newsplorer-topnav-link">Blocks</a>
            <a href="#" class="newsplorer-topnav-link">Transactions</a>
            <a href="#" class="newsplorer-topnav-link">Validators</a>
          </nav>
        </div>
      </header>

      <section class="newsplorer-hero">
        <div class="newsplorer-search" aria-label="Search"></div>
      </section>

      <div class="newsplorer-content">
        <section class="newsplorer-dashboard" aria-label="Dashboard"></section>

        <div class="newsplorer-columns">
          <section class="newsplorer-blocks" aria-label="Latest Blocks"></section>
          <section class="newsplorer-transactions" aria-label="Latest Transactions"></section>
        </div>
      </div>

      <footer class="newsplorer-footer">
        <span>Saito Blockchain Explorer</span>
        <span class="newsplorer-footer-sep">|</span>
        <span>Placeholder UI — no live data</span>
      </footer>
    </div>
  `;
};
