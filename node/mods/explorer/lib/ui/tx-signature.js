const TxSignatureTemplate = require('./tx-signature.template');

function formatCreatedAt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return '—';
  }
  const ms = n < 1e12 ? n * 1000 : n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

class TxSignature {
  constructor(app, mod, signature) {
    this.app = app;
    this.mod = mod;
    this.signature = String(signature || '');
    this.container = '.explorer-view';
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.mod.txSignatureComponent = this;
    this.paint();
  }

  paint() {
    const loading = !this.mod.txSignatureReady;
    const error = this.mod.txSignatureError
      ? this.app.browser.escapeHTML(this.mod.txSignatureError)
      : null;
    const result = this.mod.txSignatureResult || {};
    const status = String(result.status || '');
    const blockHash = String(result.block_hash || '');
    const blockId = String(result.block_id || '');
    const blockTarget = blockHash || blockId;
    const canVisitBlock = Boolean(blockTarget) && status && status !== 'UNCONFIRMED' && status !== 'NOT FOUND';

    this.app.browser.replaceElementContentBySelector(
      TxSignatureTemplate({
        loading,
        error,
        signature: this.app.browser.escapeHTML(this.signature),
        status: this.app.browser.escapeHTML(status),
        blockId: this.app.browser.escapeHTML(blockId),
        blockHash: this.app.browser.escapeHTML(blockHash),
        blockHref: canVisitBlock ? `/explorer/block/${encodeURIComponent(blockTarget)}` : '',
        blockInput: canVisitBlock ? this.app.browser.escapeHTML(blockTarget) : '',
        transactionId: this.app.browser.escapeHTML(String(result.transaction_id || '')),
        longestChain: Number(result.lc) === 1 ? 'yes' : result.source === 'database' ? 'no' : '',
        createdAt: this.app.browser.escapeHTML(formatCreatedAt(result.created_at))
      }),
      this.container
    );

    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('.explorer-utxo-block-link').forEach((link) => {
      link.onclick = (event) => {
        event.preventDefault();
        const input = link.getAttribute('data-block-input');
        if (input) {
          this.mod.renderBlock(input, { pushState: true, animate: true });
        }
      };
    });
  }
}

module.exports = TxSignature;
