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
    this.featuredName = scope === 'main' ? 'Featured' : 'Featured Items';
    this.featuredVisible = true;
    this.status = '';
    this.saving = false;
    this.dragIndex = null;
    this.promptOpen = false;
    this.promptError = '';
    this.promptValue = '';
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
    const fallback = this.scope === 'main' ? 'Featured' : 'Featured Items';
    const featuredName = String(result.featured_name || '').trim();
    this.featuredName = featuredName || fallback;
    this.featuredVisible = result.featured_visible !== 0 && result.featured_visible !== false;
    this.categories = (result.categories || [])
      .filter((category) => String(category.category_id || '') !== 'featured')
      .map((category) => ({
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
    host.innerHTML = NavigationEditorTemplate({
      categories: this.categories,
      featuredName: this.featuredName,
      featuredVisible: this.featuredVisible,
      status: this.status,
      saving: this.saving,
      promptOpen: this.promptOpen,
      promptError: this.promptError,
      promptValue: this.promptValue
    });
    this.attachEvents(host);
    if (this.promptOpen) {
      const dialog = host.querySelector('.store-nav-dialog');
      const field = host.querySelector('[data-new-name]');
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
      field?.focus();
    }
  }

  addCategory(name) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    this.promptValue = clean;
    if (!clean) {
      this.promptError = 'Enter a category name';
      this.promptOpen = true;
      this.render();
      return;
    }
    const reserved = clean.toLowerCase();
    const featuredName = String(this.featuredName || '').trim().toLowerCase();
    if (reserved === 'featured' || (featuredName && reserved === featuredName)) {
      this.promptError = 'Featured Items is reserved';
      this.promptOpen = true;
      this.render();
      return;
    }
    if (this.categories.some((category) => category.name.toLowerCase() === reserved)) {
      this.promptError = 'That category already exists';
      this.promptOpen = true;
      this.render();
      return;
    }
    const category_id = slugify(clean);
    if (
      !isCategoryId(category_id) ||
      this.categories.some((category) => category.category_id === category_id)
    ) {
      this.promptError = 'Enter a different category name';
      this.promptOpen = true;
      this.render();
      return;
    }
    this.categories.unshift({ category_id, name: clean, listing_order: 'newest' });
    this.status = '';
    this.promptError = '';
    this.promptValue = '';
    this.promptOpen = false;
    this.render();
  }

  attachEvents(host) {
    const featuredInput = host.querySelector('[data-featured-name]');
    featuredInput?.addEventListener('input', (event) => {
      this.featuredName = event.target.value;
    });
    featuredInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        featuredInput.blur();
      }
    });
    host.querySelector('[data-featured-visible]')?.addEventListener('change', (event) => {
      this.featuredVisible = !!event.target.checked;
    });

    host.querySelector('[data-add-category]')?.addEventListener('click', () => {
      this.promptError = '';
      this.promptValue = '';
      this.promptOpen = true;
      this.render();
    });
    host.querySelector('[data-cancel-category]')?.addEventListener('click', () => {
      this.promptOpen = false;
      this.promptError = '';
      this.promptValue = '';
      this.render();
    });
    host.querySelector('[data-category-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.addCategory(host.querySelector('[data-new-name]')?.value || '');
    });

    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = Number(button.closest('[data-category-row]')?.getAttribute('data-index'));
        this.categories = this.categories.filter((_, rowIndex) => rowIndex !== index);
        this.status = '';
        this.render();
      });
    });

    host.querySelectorAll('[data-category-row]').forEach((row) => {
      row.addEventListener('dragstart', (event) => {
        if (event.target.closest('[data-delete]')) {
          event.preventDefault();
          return;
        }
        this.dragIndex = Number(row.getAttribute('data-index'));
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(this.dragIndex));
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        host.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
      });
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        host.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
        if (Number(row.getAttribute('data-index')) !== this.dragIndex) {
          row.classList.add('is-drop-target');
        }
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = this.dragIndex;
        const to = Number(row.getAttribute('data-index'));
        if (!Number.isInteger(from) || from === to || from < 0 || from >= this.categories.length) {
          return;
        }
        const next = this.categories.slice();
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        this.categories = next;
        this.dragIndex = null;
        this.status = '';
        this.render();
      });
    });

    host.querySelector('[data-save-navigation]')?.addEventListener('click', () => {
      if (this.saving) {
        return;
      }
      const featuredName = String(this.featuredName || '').trim().replace(/\s+/g, ' ');
      if (!featuredName || featuredName.length > 40) {
        this.status = 'Enter a name for the first item';
        this.render();
        return;
      }
      if (this.categories.some((category) => category.name.toLowerCase() === featuredName.toLowerCase())) {
        this.status = 'That category already exists';
        this.render();
        return;
      }
      this.featuredName = featuredName;
      this.saving = true;
      this.status = 'Saving…';
      this.render();
      try {
        this.mod.createModifyStoreNavigationTransaction(
          this.categories,
          this.scope,
          (response) => {
            this.saving = false;
            this.status = response?.err || 'Saved';
            this.render();
          },
          this.featuredName,
          this.featuredVisible
        );
      } catch (err) {
        this.saving = false;
        this.status = err?.message || 'Unable to save changes';
        this.render();
      }
    });
  }
}

module.exports = NavigationEditor;
