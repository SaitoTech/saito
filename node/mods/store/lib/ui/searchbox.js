const SearchBoxTemplate = require('./searchbox.template');

class SearchBox {
  constructor(app, mod, { publicKey = '', onResults = null, onClear = null } = {}) {
    this.app = app;
    this.mod = mod;
    this.publicKey = String(publicKey || '').trim();
    this.onResults = onResults;
    this.onClear = onClear;
    this.term = '';
    this.host = null;
  }

  setPublicKey(publicKey = '') {
    this.publicKey = String(publicKey || '').trim();
  }

  mount(host) {
    if (!host) {
      return;
    }
    this.host = host;
    host.innerHTML = SearchBoxTemplate({ term: this.term });
    const form = host.querySelector('[data-store-search-form]');
    const input = host.querySelector('[data-store-search-input]');
    const submit = (event) => {
      event.preventDefault();
      this.term = input?.value || '';
      this.search(0);
    };
    input?.addEventListener('input', () => {
      this.term = input.value;
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !form) {
        return;
      }
      event.preventDefault();
      form.requestSubmit();
    });
    form?.addEventListener('submit', submit);
  }

  search(offset = 0) {
    const term = String(this.term || '');
    if (!term.trim()) {
      if (typeof this.onClear === 'function') {
        this.onClear();
      }
      return;
    }
    const peerKey = this.mod.store_public_key;
    if (!peerKey || !this.app?.network?.sendRequestAsTransaction) {
      this.deliver({ err: 'Store peer unavailable' });
      return;
    }
    this.app.network.sendRequestAsTransaction(
      'store-search',
      {
        module: this.mod.name,
        search_term: term,
        public_key: this.publicKey,
        offset
      },
      (response) => {
        if (!response || response.err || !Array.isArray(response.signatures)) {
          this.deliver({ err: response?.err || 'Unable to search' });
          return;
        }
        this.deliver(response);
      },
      peerKey
    );
  }

  deliver(result) {
    if (typeof this.onResults === 'function') {
      this.onResults(result);
    }
  }
}

module.exports = SearchBox;
