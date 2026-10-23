const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListingFieldEditTemplate = require('./listing-field-edit.template');

const EXCLUDED_WEB3_TICKERS = new Set(['ERC-SAITO', 'BEP-SAITO']);

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function returnStoreWeb3Tickers(app, current = 'SAITO') {
  const tickers = ['SAITO'];
  const mixin = app?.modules?.returnModule?.('Mixin');
  const currencies = Array.isArray(mixin?.available_currencies) ? mixin.available_currencies : [];
  for (const currency of currencies) {
    const ticker = String(currency?.ticker || '').trim().toUpperCase();
    if (!ticker || ticker === 'SAITO' || EXCLUDED_WEB3_TICKERS.has(ticker)) {
      continue;
    }
    if (!tickers.includes(ticker)) {
      tickers.push(ticker);
    }
  }
  const selected = String(current || '').trim().toUpperCase();
  if (selected && !tickers.includes(selected)) {
    tickers.push(selected);
  }
  return tickers;
}

function storeWeb3TickersAnswered(app) {
  if (requestStoreWeb3Tickers.resolved) {
    return true;
  }
  const mixin = app?.modules?.returnModule?.('Mixin');
  const currencies = mixin?.available_currencies;
  // null is only assigned when a reply arrives without a currency list.
  // [] is also the value before any reply, so it does not count as an answer.
  if (currencies === null) {
    requestStoreWeb3Tickers.resolved = true;
    return true;
  }
  if (Array.isArray(currencies) && currencies.length) {
    requestStoreWeb3Tickers.resolved = true;
    return true;
  }
  return false;
}

function rememberStoreWeb3TickerResponse(app) {
  if (requestStoreWeb3Tickers.listening || !app?.connection?.on) {
    return;
  }
  requestStoreWeb3Tickers.listening = true;
  app.connection.on('saito-purchase-cryptos', () => {
    requestStoreWeb3Tickers.resolved = true;
    requestStoreWeb3Tickers.pending = false;
  });
}

function requestStoreWeb3Tickers(app, { force = false } = {}) {
  const mixin = app?.modules?.returnModule?.('Mixin');
  const peerKey = mixin?.buysaito_peer?.publicKey;
  if (!peerKey) {
    return;
  }
  rememberStoreWeb3TickerResponse(app);
  if (force) {
    requestStoreWeb3Tickers.resolved = false;
    requestStoreWeb3Tickers.pending = false;
  } else if (storeWeb3TickersAnswered(app) || requestStoreWeb3Tickers.pending) {
    return;
  }
  requestStoreWeb3Tickers.pending = true;
  app.network.sendRequestAsTransaction('buysaito available currencies', null, null, peerKey);
}

requestStoreWeb3Tickers.resolved = false;
requestStoreWeb3Tickers.pending = false;
requestStoreWeb3Tickers.listening = false;
requestStoreWeb3Tickers.reset = () => {
  requestStoreWeb3Tickers.resolved = false;
  requestStoreWeb3Tickers.pending = false;
  requestStoreWeb3Tickers.listening = false;
};

class ListingFieldEdit {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.onSave = null;

    this.app.connection.on('saito-purchase-cryptos', () => {
      this.refreshTickerSelect();
    });
  }

  refreshTickerSelect() {
    const select = document.getElementById('saito-overlay-form-ticker');
    if (!select) {
      return;
    }
    const current = select.value || 'SAITO';
    const tickers = returnStoreWeb3Tickers(this.app, current);
    select.innerHTML = tickers
      .map(
        (ticker) =>
          `<option value="${escapeHtml(ticker)}"${ticker === current ? ' selected' : ''}>${escapeHtml(ticker)}</option>`
      )
      .join('');
  }

  /**
   * @param {object} options
   * @param {string} options.title
   * @param {string} options.value
   * @param {boolean} [options.multiline]
   * @param {string} [options.inputType]
   * @param {string} [options.placeholder]
   * @param {(value: string) => void|boolean} options.onSave - return false to keep overlay open
   */
  render(options = {}) {
    this.onSave = options.onSave || null;

    this.overlay.show(
      ListingFieldEditTemplate({
        title: options.title || 'Edit',
        value: options.value ?? '',
        multiline: !!options.multiline,
        inputType: options.inputType || 'text',
        placeholder: options.placeholder || '',
        tickers: options.tickers || null,
        ticker: options.ticker || 'SAITO'
      })
    );

    this.attachEvents();
  }

  attachEvents() {
    const form = document.querySelector('.store-listing-field-edit');
    const input = document.getElementById('saito-overlay-form-input');
    if (!form || !input) {
      return;
    }

    input.focus();
    if (typeof input.select === 'function') {
      input.select();
    }

    form.querySelector('[data-action="cancel"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.overlay.close();
    });

    form.querySelector('.saito-overlay-form-submit')?.addEventListener('click', (e) => {
      e.preventDefault();
      const value = input.value ?? '';
      const ticker = form.querySelector('[data-field="ticker"]')?.value || '';
      if (typeof this.onSave === 'function') {
        const ok = this.onSave(value, ticker);
        if (ok === false) {
          return;
        }
      }
      this.overlay.close();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.querySelector('.saito-overlay-form-submit')?.click();
    });
  }
}

module.exports = ListingFieldEdit;
module.exports.returnStoreWeb3Tickers = returnStoreWeb3Tickers;
module.exports.requestStoreWeb3Tickers = requestStoreWeb3Tickers;
module.exports.storeWeb3TickersAnswered = storeWeb3TickersAnswered;
