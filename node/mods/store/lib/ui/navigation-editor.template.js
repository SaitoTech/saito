function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({ categories = [], status = '' } = {}) => {
  const rows = categories
    .map((category, index) => {
      const id = escapeHtml(category.category_id || '');
      const name = escapeHtml(category.name || '');
      const order = category.listing_order === 'alphabetical' ? 'alphabetical' : 'newest';
      return `
        <li data-category-row data-index="${index}">
          <input type="text" data-field="name" value="${name}" maxlength="40" aria-label="Category name" />
          <input type="text" data-field="id" value="${id}" maxlength="32" spellcheck="false" aria-label="Category id" />
          <select data-field="order" aria-label="Listing order">
            <option value="newest"${order === 'newest' ? ' selected' : ''}>Newest</option>
            <option value="alphabetical"${order === 'alphabetical' ? ' selected' : ''}>Alphabetical</option>
          </select>
          <button type="button" data-move="up">Up</button>
          <button type="button" data-move="down">Down</button>
          <button type="button" data-delete>Delete</button>
        </li>`;
    })
    .join('');

  return `
    <section class="store-navigation-editor">
      <h2>Categories</h2>
      <ol data-category-list>${rows}</ol>
      <div class="store-navigation-add">
        <input type="text" data-new-name maxlength="40" placeholder="Category name" aria-label="New category name" />
        <button type="button" data-add-category>Add category</button>
      </div>
      <button type="button" data-save-navigation>Save categories</button>
      <p data-navigation-status>${escapeHtml(status)}</p>
    </section>
  `;
};
