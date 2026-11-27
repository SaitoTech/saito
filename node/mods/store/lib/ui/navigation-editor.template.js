function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({
  categories = [],
  featuredName = 'Featured Items',
  featuredVisible = true,
  status = '',
  saving = false,
  promptError = '',
  promptValue = ''
} = {}) => {
  const rows = categories
    .map((category, index) => {
      const name = escapeHtml(category.name || '');
      return `
        <div class="store-nav-item" data-category-row data-index="${index}" draggable="true">
          <span class="store-nav-grip" aria-hidden="true"></span>
          <span class="store-nav-name">${name}</span>
          <button type="button" class="store-nav-delete" data-delete draggable="false" aria-label="Delete category">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>`;
    })
    .join('');

  const featured = `
        <div class="store-nav-item is-featured">
          <input type="text" class="store-nav-featured-name" data-featured-name maxlength="40" aria-label="Featured name" value="${escapeHtml(featuredName || 'Featured Items')}" />
        </div>`;

  const explanation = `<p class="store-nav-explain">To add more categories to your store, click the Add Category button. Drag and drop them into the order you wish them to appear. Remember to save your changes when done.</p>`;
  const enabled = featuredVisible ? ' checked' : '';

  const statusClass =
    status === 'Saved' ? ' is-ok' : status && status !== 'Saving…' ? ' is-error' : '';

  return `
    <section class="store-navigation-editor">
      <h3>Store Navigation</h3>
      <div class="store-nav-layout">
        <div class="store-nav-menu">
          ${featured}
          ${rows}
          <button type="button" class="store-nav-item is-add" data-add-category>
            <span class="store-nav-plus" aria-hidden="true">+</span>
            <span>Add Category</span>
          </button>
        </div>
        <div class="store-nav-copy">
          ${explanation}
          <label class="store-nav-featured-toggle">
            <input type="checkbox" data-featured-visible${enabled} />
            <span>Enable Featured Listings</span>
          </label>
        </div>
      </div>
      <div class="store-nav-actions">
        <p class="store-nav-status${statusClass}">${escapeHtml(status)}</p>
        <button type="button" class="saito-button-primary store-nav-save" data-save-navigation${saving ? ' disabled' : ''}>${saving ? 'Saving…' : 'Save Changes'}</button>
      </div>
      <dialog class="store-nav-dialog">
        <form data-category-form>
          <p>Category name</p>
          <input type="text" data-new-name maxlength="40" aria-label="Category name" value="${escapeHtml(promptValue)}" />
          <p class="store-nav-status is-error">${escapeHtml(promptError)}</p>
          <div class="store-nav-dialog-actions">
            <button type="button" class="saito-button-secondary" data-cancel-category>Cancel</button>
            <button type="submit" class="saito-button-primary">Add</button>
          </div>
        </form>
      </dialog>
    </section>
  `;
};
