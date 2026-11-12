const stubIndex = require('./stub-index');

/**
 * Host-agnostic documentation client.
 * Today: local stub. Later: fetch remote index/content without changing the UI.
 */
class DocsClient {
  constructor(options = {}) {
    this.index_url = options.index_url || null;
    this.cache = null;
  }

  async loadIndex() {
    if (this.cache) {
      return this.cache;
    }

    if (this.index_url) {
      try {
        const response = await fetch(this.index_url);
        if (!response.ok) {
          throw new Error(`Docs index HTTP ${response.status}`);
        }
        this.cache = await response.json();
        return this.cache;
      } catch (err) {
        console.warn('TSCardGen: remote docs unavailable, using stub', err);
      }
    }

    this.cache = stubIndex;
    return this.cache;
  }

  async getEntry(id) {
    const index = await this.loadIndex();
    const entry = (index.entries || []).find((item) => item.id === id);
    if (!entry) {
      return null;
    }

    if (entry.body) {
      return entry;
    }

    if (entry.contentUrl) {
      try {
        const response = await fetch(entry.contentUrl);
        if (!response.ok) {
          throw new Error(`Docs content HTTP ${response.status}`);
        }
        const body = await response.text();
        return { ...entry, body };
      } catch (err) {
        console.warn('TSCardGen: failed to load doc', id, err);
        return {
          ...entry,
          body: `<p>Unable to load this document.</p>`
        };
      }
    }

    return entry;
  }
}

module.exports = DocsClient;
