module.exports = ({
	placeholder = 'Search by Address / Txn Hash / Block / Token / Domain Name'
} = {}) => {
	return `
    <section class="newsplorer-search-component" aria-label="Search">
      <form class="newsplorer-search-form" action="#" method="get" onsubmit="return false;">
        <div class="newsplorer-search-box">
          <div class="newsplorer-search">
            <input
              type="search"
              class="newsplorer-search-input"
              placeholder="${placeholder}"
              aria-label="Search the Saito blockchain"
              autocomplete="off"
            />
          </div>
          <button type="submit" class="newsplorer-search-submit" aria-label="Search">
            <i class="fas fa-search" aria-hidden="true"></i>
          </button>
        </div>
      </form>
    </section>
  `;
};
