const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

const BINARY_KEYS = new Set(['file', 'rom', 'zip', 'wasm', 'binary']);

class ListingInspectOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.overlay.class = 'saito-overlay listing-inspect-shell';
    this.tx = null;
  }

  escapeHtml(value = '') {
    if (this.app?.browser?.escapeHTML) {
      return this.app.browser.escapeHTML(String(value));
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  classifyString(key, value) {
    const k = String(key || '').toLowerCase();
    if (k === 'image' || value.startsWith('data:image/')) {
      return 'image';
    }
    if (BINARY_KEYS.has(k)) {
      return 'binary';
    }
    if (value.startsWith('data:') && !value.startsWith('data:text/')) {
      return 'binary';
    }
    if (value.length > 8192 && !/\s/.test(value.slice(0, 400)) && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 400))) {
      return 'binary';
    }
    if (value.includes('\n') || value.length > 160) {
      return 'text';
    }
    return 'scalar';
  }

  renderValue(key, value) {
    if (typeof value === 'bigint') {
      value = value.toString();
    }
    if (value == null) {
      return `<span class="listing-inspect-empty">null</span>`;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return `<span class="listing-inspect-scalar">${this.escapeHtml(String(value))}</span>`;
    }
    if (typeof value === 'string') {
      const kind = this.classifyString(key, value);
      if (kind === 'image') {
        if (this.app?.browser?.isSafeMediaUrl?.(value)) {
          return `<figure class="listing-inspect-media"><img src="${this.escapeHtml(value)}" alt="${this.escapeHtml(key || 'image')}"></figure>`;
        }
        return `<span class="listing-inspect-binary">BINARY</span><span class="listing-inspect-bytes">${value.length} bytes</span>`;
      }
      if (kind === 'binary') {
        return `<span class="listing-inspect-binary">BINARY</span><span class="listing-inspect-bytes">${value.length} bytes</span>`;
      }
      if (kind === 'text') {
        return `<pre class="listing-inspect-text">${this.escapeHtml(value)}</pre>`;
      }
      return `<span class="listing-inspect-scalar">${this.escapeHtml(value)}</span>`;
    }
    if (Array.isArray(value)) {
      if (!value.length) {
        return `<span class="listing-inspect-empty">[]</span>`;
      }
      return `<ol class="listing-inspect-list">${value
        .map((item, i) => `<li>${this.renderValue(String(i), item)}</li>`)
        .join('')}</ol>`;
    }
    if (typeof value === 'object') {
      return this.renderObject(value);
    }
    return `<span class="listing-inspect-scalar">${this.escapeHtml(String(value))}</span>`;
  }

  renderObject(obj) {
    const entries = Object.entries(obj || {});
    if (!entries.length) {
      return `<span class="listing-inspect-empty">{}</span>`;
    }
    return `<dl class="listing-inspect-fields">${entries
      .map(([key, nested]) => {
        const nested_object =
          nested && typeof nested === 'object' && !Array.isArray(nested) && typeof nested !== 'bigint';
        return `
        <div class="listing-inspect-row${nested_object ? ' is-block' : ''}">
          <dt>${this.escapeHtml(key)}</dt>
          <dd>${this.renderValue(key, nested)}</dd>
        </div>`;
      })
      .join('')}</dl>`;
  }

  downloadTransaction() {
    const tx = this.tx;
    if (!tx || typeof tx.serialize_to_web !== 'function') {
      if (typeof siteMessage === 'function') {
        siteMessage('Transaction is not available to download.', 3000);
      }
      return;
    }
    const json = tx.serialize_to_web(this.app);
    const sig = String(tx.signature || 'listing').replace(/[^\w.-]+/g, '_').slice(0, 16);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `listing-tx-${sig}.saito`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  open(summary) {
    if (!summary) {
      return;
    }

    this.tx = null;
    this.overlay.show(`
      <article class="listing-inspect saito-overlay-panel retain-surface">
        <header>
          <h2 class="listing-inspect-title">Inspect listing</h2>
          <button type="button" class="saito-button-secondary" data-inspect-download disabled>Download transaction</button>
        </header>
        <p class="listing-inspect-status" data-inspect-status>Loading transaction…</p>
        <div class="listing-inspect-body" data-inspect-body></div>
      </article>
    `);

    const root = document.querySelector('.listing-inspect');
    root?.querySelector('[data-inspect-download]')?.addEventListener('click', () => {
      this.downloadTransaction();
    });

    const finish = (tx) => {
      const status = root?.querySelector('[data-inspect-status]');
      const host = root?.querySelector('[data-inspect-body]');
      const download = root?.querySelector('[data-inspect-download]');
      if (!host) {
        return;
      }

      this.tx = tx || null;
      if (this.tx && download) {
        download.disabled = false;
      }

      const txmsg =
        (typeof tx?.returnMessage === 'function' ? tx.returnMessage() : tx?.msg) || null;
      if (!txmsg) {
        if (status) {
          status.hidden = false;
          status.textContent = 'Listing transaction message is unavailable.';
        }
        return;
      }

      if (status) {
        status.hidden = true;
      }

      try {
        host.innerHTML = this.renderObject(txmsg);
      } catch (err) {
        host.textContent = String(err?.message || err);
      }
    };

    if (summary.listing_tx) {
      finish(summary.listing_tx);
      return;
    }

    if (typeof summary.ensureListingTransaction !== 'function') {
      finish(null);
      return;
    }

    summary
      .ensureListingTransaction()
      .then((loaded) => finish(loaded?.listing_tx || summary.listing_tx || null))
      .catch((err) => {
        const status = document.querySelector('.listing-inspect [data-inspect-status]');
        if (status) {
          status.hidden = false;
          status.textContent = err?.message || 'Unable to load listing transaction.';
        }
        if (typeof siteMessage === 'function') {
          siteMessage(err?.message || 'Unable to load listing transaction.', 4000);
        }
      });
  }
}

module.exports = ListingInspectOverlay;
