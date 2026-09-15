module.exports = ({ placeholder = 'Search by Block Hash, Public Key, or UTXOKEY' } = {}) => {
  return `
    <section class="explorer-search-component" aria-label="Search">
      <form class="explorer-search-form" action="#" method="get">
        <div class="explorer-search-box">
          <div class="explorer-search">
            <input
              type="search"
              class="saito-input explorer-search-input"
              placeholder="${placeholder}"
              aria-label="Search by block hash, public key, or UTXOKEY"
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
