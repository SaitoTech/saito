const UtxoTemplate = require('./utxo.template');
const { formatSaito, buildPublicKeyLink } = require('../explorer-format');
const { normalizeUtxoKeyHex, parseUtxoKeyHex } = require('../utxo-key');
const { formatSlipTypeName } = require('../transaction-types');

class Utxo {
  constructor(app, mod, utxokey) {
    this.app = app;
    this.mod = mod;
    this.utxokey = normalizeUtxoKeyHex(utxokey);
    this.container = '.explorer-view';
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.mod.utxoComponent = this;
    this.paint();

    if (!this.mod.utxoReady && this.mod.explorerPeer) {
      this.mod.fetchUtxoData(this.app, this.mod.explorerPeer, this.utxokey);
    }
  }

  formatSlip(slip) {
    if (!slip) {
      return null;
    }

    const rawPublicKey = slip.publicKey || slip.publicKeyHex || '';
    let publicKey = rawPublicKey;
    if (/^[0-9a-fA-F]{66}$/.test(rawPublicKey) && this.app?.crypto?.toBase58) {
      try {
        publicKey = this.app.crypto.toBase58(rawPublicKey);
      } catch (err) {
        publicKey = rawPublicKey;
      }
    }
    const blockId = String(slip.blockId ?? '');
    const canVisitBlock = /^[1-9][0-9]*$/.test(blockId);
    const typeName = String(
      slip.type || slip.slipTypeName || formatSlipTypeName(slip.typeId) || ''
    );
    const amountRaw = slip.amount != null ? String(slip.amount) : '';
    let amountDisplay = amountRaw || '—';
    try {
      const amount = BigInt(amountRaw || 0);
      if (typeName === 'Bound') {
        amountDisplay = amount === 0n ? '0 (not SAITO)' : `${amount.toLocaleString('en-US')} units`;
      } else {
        amountDisplay = formatSaito(amount);
      }
    } catch (err) {
      amountDisplay = amountRaw || '—';
    }

    return {
      type: this.app.browser.escapeHTML(typeName),
      blockId: this.app.browser.escapeHTML(blockId),
      blockHref: canVisitBlock ? `/explorer/block/${encodeURIComponent(blockId)}` : '',
      blockInput: canVisitBlock ? this.app.browser.escapeHTML(blockId) : '',
      transactionId: this.app.browser.escapeHTML(
        String(slip.transactionId ?? slip.txOrdinal ?? '')
      ),
      slipIndex: this.app.browser.escapeHTML(String(slip.slipIndex ?? '')),
      publicKey: buildPublicKeyLink(this.app, publicKey, publicKey),
      amountDisplay: this.app.browser.escapeHTML(amountDisplay)
    };
  }

  paint() {
    const loading = !this.mod.utxoReady;
    const error = this.mod.utxoError ? this.app.browser.escapeHTML(this.mod.utxoError) : null;
    const result = this.mod.utxoResult || {};
    const parsed = parseUtxoKeyHex(this.utxokey);
    const localSlip = parsed
      ? {
          type: parsed.slipTypeName,
          blockId: parsed.blockId.toString(),
          transactionId: parsed.txOrdinal.toString(),
          slipIndex: String(parsed.slipIndex),
          publicKeyHex: parsed.publicKeyHex,
          amount: parsed.amount.toString()
        }
      : null;

    this.app.browser.replaceElementContentBySelector(
      UtxoTemplate({
        loading,
        error,
        utxokey: this.app.browser.escapeHTML(this.utxokey),
        status: this.app.browser.escapeHTML(String(result.status || '')),
        slip: this.formatSlip(result.slip || localSlip)
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

module.exports = Utxo;
