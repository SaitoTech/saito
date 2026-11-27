const Summary = require('../summary');
const Teasers = require('./teasers');

function loadListing(app, mod, signature) {
  return new Promise((resolve, reject) => {
    const peerKey = mod.store_public_key;
    if (!peerKey || !app?.network?.sendRequestAsTransaction) {
      reject(new Error('Store peer unavailable'));
      return;
    }
    app.network.sendRequestAsTransaction(
      'load-listing',
      { module: mod.name, signature },
      (response) => {
        if (!response || response.err || !response.listing) {
          reject(new Error(response?.err || 'Unable to load listing'));
          return;
        }
        resolve(new Summary(app, mod, response.listing));
      },
      peerKey
    );
  });
}

class SearchView {
  constructor(app, mod, container = '', { onPage = null } = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.onPage = onPage;
    this.teasers = new Teasers(app, mod, '');
    this.signatures = [];
    this.total = 0;
    this.offset = 0;
    this.error = '';
    this.token = 0;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }
    const host = this.host();
    if (!host) {
      return;
    }
    host.innerHTML = `
      <section class="store-search-results catalog">
        <p class="store-search-count" data-search-count></p>
        <p class="store-search-error" data-search-error hidden></p>
        <div class="teasers" aria-label="Search results"></div>
        <div class="store-search-pages">
          <button type="button" data-search-prev>Previous</button>
          <button type="button" data-search-next>Next</button>
        </div>
      </section>
    `;
    this.teasers.container = `${this.container} .teasers`;
    host.querySelector('[data-search-prev]')?.addEventListener('click', () => {
      if (this.offset <= 0 || typeof this.onPage !== 'function') {
        return;
      }
      this.onPage(Math.max(0, this.offset - 24));
    });
    host.querySelector('[data-search-next]')?.addEventListener('click', () => {
      if (typeof this.onPage !== 'function') {
        return;
      }
      if (this.offset + this.signatures.length >= this.total) {
        return;
      }
      this.onPage(this.offset + this.signatures.length);
    });
    this.paintStatus();
  }

  host() {
    return this.container ? document.querySelector(this.container) : null;
  }

  show(result = {}) {
    if (!this.host()?.querySelector('[data-search-count]')) {
      this.render();
    }
    if (result.err) {
      this.error = String(result.err);
      this.paintStatus();
      return;
    }
    this.error = '';
    this.signatures = Array.isArray(result.signatures) ? result.signatures : [];
    this.total = Number(result.total) || 0;
    this.offset = Number(result.offset) || 0;
    this.paintStatus();
    void this.loadSignatures();
  }

  paintStatus() {
    const host = this.host();
    if (!host) {
      return;
    }
    const count = host.querySelector('[data-search-count]');
    const error = host.querySelector('[data-search-error]');
    const previous = host.querySelector('[data-search-prev]');
    const next = host.querySelector('[data-search-next]');
    if (count) {
      const noun = this.total === 1 ? 'result' : 'results';
      count.textContent = `${this.total} ${noun}`;
    }
    if (error) {
      error.hidden = !this.error;
      error.textContent = this.error;
    }
    if (previous) {
      previous.disabled = this.offset <= 0;
    }
    if (next) {
      next.disabled = this.offset + this.signatures.length >= this.total;
    }
  }

  async loadSignatures() {
    const token = ++this.token;
    const signatures = this.signatures.slice();
    try {
      const summaries = [];
      for (const signature of signatures) {
        summaries.push(await loadListing(this.app, this.mod, signature));
        if (token !== this.token) {
          return;
        }
      }
      if (token !== this.token) {
        return;
      }
      const teasers = this.host()?.querySelector('.teasers');
      if (teasers) {
        this.teasers.render(`${this.container} .teasers`, summaries);
      }
    } catch (err) {
      if (token !== this.token) {
        return;
      }
      this.error = err?.message || 'Unable to load listings';
      this.paintStatus();
    }
  }
}

module.exports = SearchView;
