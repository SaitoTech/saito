const VocabMainTemplate = require('./vocab-main.template');
const {
  PAGE_SIZES,
  DISPLAY_FIELDS,
  listPrefs,
  visibleFields,
  sortVocabulary,
  pageWindow,
  idsBetween,
  cellText
} = require('./vocab-list');

class PopupVocab {
  constructor(app, mod, container = '.popup-lesson') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.name = 'PopupVocab';
    this.records = [];
    this.selected = new Set();
    this.anchorId = null;
    this.sortKey = 'simplified';
    this.sortDirection = 'asc';
    this.page = 0;
    this.pageSize = 25;
    this.notice = '';
  }

  async render() {
    const container = document.querySelector('.saito-container');
    if (container) {
      container.classList.remove('popup-vocab-view');
    }
    if (typeof this.mod.ensureIntroductoryVocabulary === 'function') {
      await this.mod.ensureIntroductoryVocabulary();
    }
    await this.reload();
  }

  async reload() {
    this.records = (await this.mod.returnAllVocabulary()) || [];
    const known = new Set(this.records.map((record) => Number(record.id)));
    Array.from(this.selected).forEach((id) => {
      if (!known.has(id)) {
        this.selected.delete(id);
      }
    });
    if (this.anchorId != null && !known.has(this.anchorId)) {
      this.anchorId = null;
    }
    this.draw();
  }

  sortedRecords() {
    return sortVocabulary(this.records, this.sortKey, this.sortDirection);
  }

  currentWindow() {
    const windowed = pageWindow(this.sortedRecords(), this.page, this.pageSize);
    this.page = windowed.page;
    this.pageSize = windowed.pageSize;
    return windowed;
  }

  draw() {
    const main = document.querySelector('.saito-main');
    if (!main) {
      return;
    }
    const scroller = document.querySelector('.popup-vocab-scroll');
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const windowed = this.currentWindow();
    const fields = visibleFields(listPrefs(this.app));
    const view = {
      fields,
      displayFields: DISPLAY_FIELDS,
      prefs: listPrefs(this.app),
      sortKey: this.sortKey,
      sortDirection: this.sortDirection,
      rows: windowed.rows.map((record) => {
        return {
          id: Number(record.id),
          label: record.field1 || record.field2 || record.field4 || 'vocabulary entry',
          cells: fields.map((field) => {
            return {
              key: field.key,
              text: cellText(record, field),
              chinese: field.chinese,
              stat: field.stat
            };
          })
        };
      }),
      selected: this.selected,
      page: windowed.page,
      pages: windowed.pages,
      start: windowed.start,
      end: windowed.end,
      total: windowed.total,
      pageSize: windowed.pageSize,
      pageSizes: PAGE_SIZES,
      notice: this.notice
    };
    main.innerHTML = VocabMainTemplate(view);
    const sidebar = document.querySelector('.saito-sidebar.right');
    if (sidebar) {
      sidebar.innerHTML = VocabMainTemplate.sidebar(view);
    }
    const nextScroller = document.querySelector('.popup-vocab-scroll');
    if (nextScroller) {
      nextScroller.scrollTop = scrollTop;
    }
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.popup-vocab-manager');
    if (!root) {
      return;
    }

    root.addEventListener('click', (event) => {
      const pick = event.target.closest('.popup-vocab-pick');
      if (pick && event.shiftKey && this.anchorId != null) {
        event.preventDefault();
        this.ignorePickId = Number(pick.value);
        const id = Number(pick.value);
        idsBetween(this.sortedRecords(), this.anchorId, id).forEach((recordId) => {
          this.selected.add(recordId);
        });
        this.anchorId = id;
        this.draw();
        return;
      }

      const sort = event.target.closest('[data-sort]');
      if (sort) {
        const key = sort.dataset.sort;
        if (this.sortKey === key) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortKey = key;
          this.sortDirection = 'asc';
        }
        this.page = 0;
        this.draw();
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action || action.disabled) {
        return;
      }
      const name = action.dataset.action;
      if (name === 'delete') {
        this.deleteSelected();
      } else if (name === 'review') {
        this.mod.review.render();
      } else if (name === 'review-selected') {
        const ids = Array.from(this.selected);
        this.selected.clear();
        this.anchorId = null;
        this.mod.review.render(ids);
        this.draw();
      } else if (name === 'prev') {
        this.page -= 1;
        this.draw();
      } else if (name === 'next') {
        this.page += 1;
        this.draw();
      }
    });

    root.addEventListener('change', (event) => {
      const pick = event.target.closest('.popup-vocab-pick');
      if (pick) {
        const id = Number(pick.value);
        if (this.ignorePickId === id) {
          this.ignorePickId = null;
          return;
        }
        if (pick.checked) {
          this.selected.add(id);
        } else {
          this.selected.delete(id);
        }
        this.anchorId = id;
        this.draw();
        return;
      }

      const display = event.target.closest('[data-display]');
      if (display) {
        this.toggleDisplay(display.dataset.display, display.checked);
        return;
      }

      const size = event.target.closest('[data-action="page-size"]');
      if (size) {
        const start = this.page * this.pageSize;
        this.pageSize = Number(size.value);
        this.page = Math.floor(start / this.pageSize);
        this.draw();
      }
    });

    this.attachSidebarEvents();
  }

  attachSidebarEvents() {
    const sidebar = document.querySelector('.popup-vocab-sidebar');
    if (!sidebar) {
      return;
    }
    sidebar.addEventListener('change', (event) => {
      const display = event.target.closest('[data-display]');
      if (!display) {
        return;
      }
      this.toggleDisplay(display.dataset.display, display.checked);
    });
    sidebar.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action="review"]');
      if (!action) {
        return;
      }
      this.mod.review.render();
    });
  }

  toggleDisplay(key, checked) {
    const prefs = listPrefs(this.app);
    const next = Object.assign({}, prefs);
    next[key] = checked ? 1 : 0;
    if (!visibleFields(next).length) {
      next[key] = 1;
      this.notice = 'At least one field stays visible';
      this.draw();
      return;
    }
    if (!this.app.options.popup) {
      this.app.options.popup = {};
    }
    this.app.options.popup.vocab_list = next;
    this.notice = '';
    this.mod.save();
    this.draw();
  }

  async deleteSelected() {
    const ids = Array.from(this.selected);
    if (!ids.length) {
      return;
    }
    const noun = ids.length === 1 ? 'entry' : 'entries';
    if (!window.confirm('Delete ' + ids.length + ' selected vocabulary ' + noun + '?')) {
      return;
    }
    try {
      await this.mod.deleteVocabulary(ids);
    } catch (err) {
      this.notice = (err && err.message) || 'Could not delete the selected vocabulary';
      this.draw();
      return;
    }
    this.selected.clear();
    this.anchorId = null;
    this.notice = '';
    await this.reload();
  }
}

module.exports = PopupVocab;
