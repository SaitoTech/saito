const ModerateViewTemplate = require('./moderate-view.template');
const CatalogFooterTemplate = require('./catalog-footer.template');
const Summary = require('../summary');
const { DEFAULT_PAGE_SIZE, normalizeOffset, normalizePageSize } = require('../categories');

class ModerateView {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.listings = [];
    this.pagination = null;
    this.page = 1;
    this.page_size = DEFAULT_PAGE_SIZE;
    this.sort = 'created_at';
    this.direction = 'desc';
    this.loading = false;
    this.denied = false;
    this.request_token = 0;
    this.last_checked_index = -1;
    this.busy = false;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }
    if (!this.container) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(
      ModerateViewTemplate({ loading: this.loading, denied: this.denied }),
      this.container
    );

    if (this.denied) {
      return;
    }

    this.renderTable();
    this.attachToolbarEvents();
  }

  reload() {
    return this.loadPage({ page: this.page, scroll: false });
  }

  async show() {
    this.denied = false;
    this.render();
    return this.loadPage({ page: 1, scroll: false });
  }

  loadPendingPage({ offset = 0, page_size = this.page_size, sort = this.sort, direction = this.direction } = {}) {
    return new Promise((resolve, reject) => {
      const peerKey = this.mod.store_public_key;
      if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
        reject(new Error('Store peer unavailable'));
        return;
      }

      this.app.network.sendRequestAsTransaction(
        'load-pending-listings',
        {
          module: 'Store',
          offset: normalizeOffset(offset),
          page_size: normalizePageSize(page_size),
          sort,
          direction
        },
        (response) => {
          if (!response || response.err || Number(response.authorized) !== 1) {
            reject(new Error(response?.err || 'Unauthorized access'));
            return;
          }
          if (!Array.isArray(response.listings)) {
            reject(new Error('Invalid load-pending-listings response'));
            return;
          }
          resolve(response);
        },
        peerKey,
        true
      );
    });
  }

  sendModerateAction(action, signatures) {
    return new Promise((resolve, reject) => {
      const peerKey = this.mod.store_public_key;
      if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
        reject(new Error('Store peer unavailable'));
        return;
      }

      this.app.network.sendRequestAsTransaction(
        'moderate-listings',
        {
          module: 'Store',
          action,
          signatures
        },
        (response) => {
          if (!response || response.err || Number(response.authorized) !== 1) {
            reject(new Error(response?.err || 'Unauthorized access'));
            return;
          }
          resolve(response);
        },
        peerKey,
        true
      );
    });
  }

  async loadPage({ page = this.page, sort = this.sort, direction = this.direction, scroll = false } = {}) {
    const next_page = Math.max(1, Number(page) || 1);
    const next_sort = String(sort || 'created_at');
    const next_dir = String(direction || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const offset = (next_page - 1) * this.page_size;
    const token = ++this.request_token;

    this.page = next_page;
    this.sort = next_sort;
    this.direction = next_dir;
    this.loading = true;
    this.denied = false;
    this.showLoading();

    try {
      const result = await this.loadPendingPage({
        offset,
        page_size: this.page_size,
        sort: next_sort,
        direction: next_dir
      });
      if (token !== this.request_token) {
        return;
      }

      this.listings = (result.listings || [])
        .map((data) => new Summary(this.app, this.mod, data))
        .filter((summary) => !!summary.listing_signature);
      this.pagination = result.pagination || null;
      this.page = this.pagination?.page || next_page;
      this.sort = result.sort || next_sort;
      this.direction = result.direction || next_dir;
      this.syncPendingCount(result.pending, 1);
    } catch (err) {
      if (token !== this.request_token) {
        return;
      }
      const unauthorized = /unauthor/i.test(String(err?.message || ''));
      this.denied = unauthorized;
      this.listings = [];
      this.pagination = null;
      if (unauthorized) {
        this.syncPendingCount(0, 0);
      }
      console.warn('Store: load-pending-listings failed', err?.message || err);
    }

    if (token !== this.request_token) {
      return;
    }

    this.loading = false;
    this.render();
    if (scroll) {
      document.querySelector(`${this.container} .moderation-page`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  syncPendingCount(pending, authorized = 1) {
    this.mod.applyStoreModerationResponse?.({
      authorized: Number(authorized) === 1 ? 1 : 0,
      pending: Math.max(0, Number(pending) || 0)
    });
  }

  showLoading() {
    const status = document.querySelector(`${this.container} [data-storefront-status]`);
    if (!status) {
      this.render();
      return;
    }
    status.hidden = false;
    status.innerHTML = `<div class="saito-spinner" aria-hidden="true"></div><p>Loading listings…</p>`;
  }

  renderTable() {
    const host = document.querySelector(`${this.container} [data-listings-table]`);
    const footer = document.querySelector(`${this.container} [data-catalog-footer]`);
    if (!host) {
      return;
    }

    const status = document.querySelector(`${this.container} [data-storefront-status]`);
    if (status) {
      status.hidden = true;
      status.innerHTML = '';
    }

    const total = Number(this.pagination?.total ?? this.listings.length);
    if (!total) {
      host.innerHTML =
        '<div class="storefront-empty"><p class="body">No listings awaiting moderation.</p></div>';
      if (footer) {
        footer.hidden = true;
        footer.innerHTML = '';
      }
      this.syncActionButtons();
      return;
    }

    host.innerHTML = ModerateViewTemplate.table({
      listings: this.listings,
      sort: this.sort,
      direction: this.direction
    });
    this.attachTableEvents();

    if (footer) {
      footer.hidden = false;
      footer.innerHTML = CatalogFooterTemplate({
        pagination: this.pagination,
        empty: false
      });
      CatalogFooterTemplate.attachCatalogFooterEvents(footer, {
        page: this.page,
        pagination: this.pagination,
        onPage: (next) => {
          void this.loadPage({ page: next, scroll: true });
        }
      });
    }

    this.syncActionButtons();
  }

  selectedSignatures() {
    const root = document.querySelector(this.container);
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll('tbody [data-select-row]:checked'))
      .map((input) => input.closest('tr')?.getAttribute('data-signature') || '')
      .filter(Boolean);
  }

  syncActionButtons() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }
    const selected = this.selectedSignatures().length;
    root.querySelectorAll('[data-action="approve"], [data-action="reject"]').forEach((btn) => {
      btn.disabled = selected === 0 || this.busy;
    });

    const all = root.querySelectorAll('tbody [data-select-row]');
    const checked = root.querySelectorAll('tbody [data-select-row]:checked');
    const header = root.querySelector('[data-select-all]');
    if (header) {
      header.checked = all.length > 0 && checked.length === all.length;
      header.indeterminate = checked.length > 0 && checked.length < all.length;
    }
  }

  attachToolbarEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelector('[data-action="approve"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      void this.moderateSelected('approve');
    });
    root.querySelector('[data-action="reject"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      void this.moderateSelected('reject');
    });
  }

  attachTableEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('th[data-sort]').forEach((th) => {
      th.onclick = (e) => {
        e.preventDefault();
        const column = th.getAttribute('data-sort') || 'created_at';
        const nextDir =
          this.sort === column && this.direction === 'asc' ? 'desc' : 'asc';
        void this.loadPage({ page: 1, sort: column, direction: nextDir, scroll: false });
      };
    });

    const rows = Array.from(root.querySelectorAll('tbody tr[data-signature]'));
    const header = root.querySelector('[data-select-all]');
    if (header) {
      header.onchange = () => {
        rows.forEach((row) => {
          const box = row.querySelector('[data-select-row]');
          if (box) {
            box.checked = header.checked;
          }
        });
        this.last_checked_index = -1;
        this.syncActionButtons();
      };
    }

    rows.forEach((row, index) => {
      const box = row.querySelector('[data-select-row]');
      if (box) {
        box.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.shiftKey && this.last_checked_index >= 0) {
            const from = Math.min(this.last_checked_index, index);
            const to = Math.max(this.last_checked_index, index);
            const check = box.checked;
            for (let i = from; i <= to; i++) {
              const other = rows[i]?.querySelector('[data-select-row]');
              if (other) {
                other.checked = check;
              }
            }
          }
          this.last_checked_index = index;
          this.syncActionButtons();
        });
        box.addEventListener('change', () => {
          this.syncActionButtons();
        });
      }

      row.querySelector('[data-action="message-seller"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openChat(e.currentTarget.getAttribute('data-public-key') || '');
      });

      row.querySelector('[data-action="preview-listing"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openPreview(row.getAttribute('data-signature') || '');
      });
    });
  }

  openChat(publicKey = '') {
    const key = String(publicKey || '').trim();
    if (!key) {
      return;
    }
    this.app.modules.returnFirstRespondTo?.('chat-manager');
    this.app.connection.emit('open-chat-with', {
      key,
      activate: true
    });
  }

  openPreview(signature = '') {
    const summary = this.listings.find(
      (item) => String(item.listing_signature || '') === String(signature || '')
    );
    if (!summary) {
      return;
    }
    const detail = this.mod.main?.listing_detail || this.mod.main?.product_overlay;
    detail?.open?.(summary, { preview: true });
  }

  async moderateSelected(action) {
    const signatures = this.selectedSignatures();
    if (!signatures.length || this.busy) {
      return;
    }

    this.busy = true;
    this.syncActionButtons();
    try {
      const result = await this.sendModerateAction(action, signatures);
      this.syncPendingCount(result.pending, 1);

      const failed = (result.results || []).filter((row) => !row.ok);
      if (failed.length && typeof siteMessage === 'function') {
        siteMessage(
          failed.length === signatures.length
            ? 'Those listings are no longer pending.'
            : 'Some listings were already moderated.',
          4000
        );
      }

      let page = this.page;
      const remaining = Number(result.pending ?? this.pagination?.total ?? 0);
      const lastPage = Math.max(1, Math.ceil(remaining / this.page_size) || 1);
      if (page > lastPage) {
        page = lastPage;
      }
      await this.loadPage({ page, scroll: false });
    } catch (err) {
      console.warn('Store: moderate-listings failed', err?.message || err);
      if (typeof siteMessage === 'function') {
        siteMessage(err?.message || 'Unable to update listings.', 4000);
      }
      if (/unauthor/i.test(String(err?.message || ''))) {
        this.denied = true;
        this.syncPendingCount(0, 0);
        this.render();
      }
    } finally {
      this.busy = false;
      this.syncActionButtons();
    }
  }
}

module.exports = ModerateView;
