const SearchTemplate = require('./search.template');
const { classifySearchQuery } = require('../search-nav');

class Search {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.data = {
      placeholder: 'Search by Block Hash or User Publickey'
    };
  }

  render(container) {
    if (!container) {
      return;
    }

    this.container = container;

    this.app.browser.replaceElementContentBySelector(SearchTemplate(this.data), container);

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    const form = root.querySelector('.explorer-search-form');
    const input = root.querySelector('.explorer-search-input');
    if (!form || !input) {
      return;
    }

    form.onsubmit = (event) => {
      event.preventDefault();
      this.submitSearch(input.value);
    };
  }

  submitSearch(raw = '') {
    const match = classifySearchQuery(this.app, raw);
    if (!match) {
      this.app.browser?.alert?.('Enter a valid block hash (32 bytes) or public key (33 bytes).');
      return;
    }

    if (match.type === 'block') {
      this.mod.renderBlock(match.value, { pushState: true, animate: true });
      return;
    }

    if (match.type === 'address') {
      this.mod.renderAddress(match.value, { pushState: true, animate: true });
    }
  }
}

module.exports = Search;
