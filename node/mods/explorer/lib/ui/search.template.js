module.exports = ({
	placeholder = 'Search by Address / Txn Hash / Block / Token / Domain Name'
} = {}) => {
	return `
    <section class="explorer-search-component" aria-label="Search">
      <form class="explorer-search-form" action="#" method="get" onsubmit="return false;">
        <div class="explorer-search-box">
          <div class="explorer-search">
            <input
              type="search"
              class="explorer-search-input"
              placeholder="${placeholder}"
              aria-label="Search the Saito blockchain"
              autocomplete="off"
            />
          </div>
          <button type="submit" class="explorer-search-submit" aria-label="Search">
            <i class="fas fa-search" aria-hidden="true"></i>
          </button>
        </div>
      </form>
    </section>
  `;
};
