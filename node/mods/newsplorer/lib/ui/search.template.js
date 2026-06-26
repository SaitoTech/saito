module.exports = () => {
	return `
    <div class="newsplorer-search-component">
      <h1 class="newsplorer-hero-title">Saito Blockchain Explorer</h1>
      <p class="newsplorer-hero-subtitle">
        Search by block, transaction signature, public key, or routing work
      </p>
      <form class="newsplorer-search-form" action="#" method="get" onsubmit="return false;">
        <div class="newsplorer-search-field">
          <i class="fa-solid fa-magnifying-glass newsplorer-search-icon" aria-hidden="true"></i>
          <input
            type="search"
            class="newsplorer-search-input"
            placeholder="Search by Block / Txn Signature / Public Key / Routing Work"
            autocomplete="off"
            aria-label="Search the Saito blockchain"
          />
        </div>
      </form>
    </div>
  `;
};
