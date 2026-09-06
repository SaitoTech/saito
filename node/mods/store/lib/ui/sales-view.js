const EmptyPanel = require('./empty-panel');
const SalesTableTemplate = require('./sales-table.template');
const CatalogFooterTemplate = require('./catalog-footer.template');
const { loadListingsPage } = require('./browse-listings');
const { DEFAULT_PAGE_SIZE } = require('../categories');

class SalesView {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.summaries = [];
    this.loading = false;
    this.loadToken = 0;
    this.page = 1;
    this.page_size = DEFAULT_PAGE_SIZE;
    this.pagination = null;
    this.empty = new EmptyPanel(app, mod, {
      title: 'No completed sales.',
      body: '',
      actionLabel: '',
      onAction: null
    });
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!this.container) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(
      `
    <div class="storefront-admin">
      <section class="catalog storefront-catalog">
        <div class="storefront-status" data-sales-status ${this.loading ? '' : 'hidden'} role="status" aria-live="polite">
          ${
            this.loading
              ? `<div class="saito-spinner" aria-hidden="true"></div>
          <p>Loading sold listings…</p>`
              : ''
          }
        </div>
        <div data-listings-table></div>
        <div class="catalog-footer" data-catalog-footer hidden></div>
      </section>
    </div>
  `,
      this.container
    );

    if (this.loading) {
      return;
    }

    this.renderResults();
  }

  /**
   * @param {import('../summary')[]|null} [summaries] Preloaded sold summaries (no extra fetch).
   */
  async show(summaries = null) {
    if (Array.isArray(summaries)) {
      this.summaries = summaries;
      this.pagination = {
        offset: 0,
        page: 1,
        page_size: summaries.length || this.page_size,
        total: summaries.length,
        total_pages: summaries.length ? 1 : 0,
        has_next: false,
        has_previous: false
      };
      this.page = 1;
      this.loading = false;
      await this.decryptSellerNotes(this.summaries);
      this.render();
      return;
    }

    this.page = 1;
    await this.loadPage({ page: 1 });
  }

  async decryptSellerNotes(summaries = []) {
    let private_key = '';
    try {
      private_key = await this.app.wallet.getPrivateKey();
    } catch (err) {
      console.warn('Store: seller private key unavailable for note decrypt', err?.message || err);
    }

    for (const summary of summaries || []) {
      summary.seller_note = '';
      const ciphertext = String(summary.note || '').trim();
      const buyer = String(summary.buyer || '').trim();
      if (!ciphertext || !buyer || !private_key) {
        continue;
      }
      try {
        const shared_secret = this.app.crypto.generateSharedSecret(private_key, buyer);
        const plain = this.app.crypto.aesDecrypt(ciphertext, shared_secret);
        if (plain) {
          summary.seller_note = plain;
        }
      } catch (err) {
        console.warn('Store: seller note decrypt failed', err?.message || err);
      }
    }
  }

  async loadPage({ page = this.page } = {}) {
    const seller = String(this.mod.publicKey || '').trim();
    if (!seller) {
      this.summaries = [];
      this.pagination = {
        offset: 0,
        page: 1,
        page_size: this.page_size,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false
      };
      this.loading = false;
      this.render();
      return;
    }

    const next_page = Math.max(1, Number(page) || 1);
    const offset = (next_page - 1) * this.page_size;

    this.page = next_page;
    this.loading = true;
    const token = ++this.loadToken;
    this.render();

    try {
      const result = await loadListingsPage(this.app, this.mod, {
        public_key: seller,
        category: '',
        offset,
        page_size: this.page_size,
        status: 'sold'
      });
      if (token !== this.loadToken) {
        return;
      }
      this.summaries = result.listings || [];
      this.pagination = result.pagination || null;
      this.page = this.pagination?.page || this.page;
      await this.decryptSellerNotes(this.summaries);
    } catch (err) {
      console.warn('Store: sold listings load failed', err?.message || err);
      if (token !== this.loadToken) {
        return;
      }
      this.summaries = [];
      this.pagination = {
        offset: 0,
        page: 1,
        page_size: this.page_size,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false
      };
    }

    if (token !== this.loadToken) {
      return;
    }

    this.loading = false;
    this.render();
  }

  renderResults() {
    const status = document.querySelector(`${this.container} [data-sales-status]`);
    if (status) {
      status.hidden = true;
      status.innerHTML = '';
    }

    const host = document.querySelector(`${this.container} [data-listings-table]`);
    const footer = document.querySelector(`${this.container} [data-catalog-footer]`);
    if (!host) {
      return;
    }

    const listings = this.summaries || [];
    const total = Number(this.pagination?.total ?? listings.length);

    if (!total) {
      host.innerHTML = '<div class="storefront-empty"></div>';
      if (footer) {
        footer.hidden = true;
        footer.innerHTML = '';
      }
      this.empty.render(`${this.container} .storefront-empty`);
      return;
    }

    host.innerHTML = SalesTableTemplate({
      listings,
      caption: 'Sales'
    });

    if (footer) {
      footer.hidden = false;
      footer.innerHTML = CatalogFooterTemplate({
        pagination: this.pagination,
        empty: false
      });
      CatalogFooterTemplate.attachCatalogFooterEvents(footer, {
        page: this.page,
        pagination: this.pagination,
        onPage: (nextPage) => this.loadPage({ page: nextPage })
      });
    }
  }
}

module.exports = SalesView;
