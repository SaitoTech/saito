function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({ term = '' } = {}) => {
  return `
    <form class="store-search" data-store-search-form>
      <input type="search" data-store-search-input aria-label="Search listings" placeholder="search" value="${escapeHtml(term)}" />
      <button type="submit" data-store-search-submit aria-label="Search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      </button>
    </form>
  `;
};
