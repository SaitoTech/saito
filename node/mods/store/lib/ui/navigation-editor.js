const NavigationEditorTemplate = require('./navigation-editor.template');
const { isCategoryId } = require('../navigation');

function slugify(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

class NavigationEditor {
  constructor(app, mod, { scope = '', container = '' } = {}) {
    this.app = app;
    this.mod = mod;
    this.scope = scope === 'main' ? 'main' : '';
    this.container = container;
    this.categories = [];
    this.status = '';
  }

  async load() {
    const { loadListingsPage } = require('./browse-listings');
    const public_key = this.scope === 'main' ? '' : this.mod.publicKey || '';
    const result = await loadListingsPage(this.app, this.mod, {
      public_key,
      category: '',
      featured: false,
      offset: 0,
      page_size: 1
    });
    this.categories = (result.categories || []).map((category) => ({
      category_id: category.category_id,
      name: category.name,
      listing_order: category.listing_order === 'alphabetical' ? 'alphabetical' : 'newest'
    }));
    this.render();
  }

  render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }
    host.innerHTML = NavigationEditorTemplate({ categories: this.categories, status: this.status });
    this.attachEvents(host);
  }

  readRows(host) {
    return Array.from(host.querySelectorAll('[data-category-row]')).map((row) => ({
      name: row.querySelector('[data-field="name"]')?.value || '',
      category_id: row.querySelector('[data-field="id"]')?.value || '',
      listing_order: row.querySelector('[data-field="order"]')?.value || 'newest'
    }));
  }

  attachEvents(host) {
    host.querySelector('[data-add-category]')?.addEventListener('click', () => {
      const name = host.querySelector('[data-new-name]')?.value || '';
      const category_id = slugify(name);
      this.categories = this.readRows(host);
      if (!name.trim() || !isCategoryId(category_id)) {
        this.status = 'Enter a name that can become a category id';
        this.render();
        return;
      }
      this.categories.push({ category_id, name: name.trim(), listing_order: 'newest' });
      this.status = '';
      this.render();
    });

    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.closest('[data-category-row]')?.getAttribute('data-index'));
        this.categories = this.readRows(host).filter((_, rowIndex) => rowIndex !== index);
        this.render();
      });
    });

    host.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.closest('[data-category-row]')?.getAttribute('data-index'));
        const target = button.getAttribute('data-move') === 'up' ? index - 1 : index + 1;
        const rows = this.readRows(host);
        if (target < 0 || target >= rows.length) {
          return;
        }
        const [item] = rows.splice(index, 1);
        rows.splice(target, 0, item);
        this.categories = rows;
        this.render();
      });
    });

    host.querySelector('[data-save-navigation]')?.addEventListener('click', () => {
      this.categories = this.readRows(host).map((row) => ({
        ...row,
        name: row.name.trim(),
        category_id: row.category_id.trim()
      }));
      this.mod.createModifyStoreNavigationTransaction(
        this.categories,
        this.scope,
        (response) => {
          this.status = response?.err || 'Categories saved';
          this.render();
        }
      );
    });
  }
}

module.exports = NavigationEditor;
