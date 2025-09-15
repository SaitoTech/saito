const NftTemplate = require('./nft-card.template');

class NftCard {
  constructor(app, mod, container = '', tx = null, data = null, callback = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;

    //
    // nft details
    //
    this.id = data?.id;
    this.tx_sig = data?.tx_sig;
    this.slip1 = data?.slip1;
    this.slip2 = data?.slip2;
    this.slip3 = data?.slip3;

    //
    // tx details
    //
    this.tx = tx;

    this.amount = BigInt(0); // nolans
    this.deposit = BigInt(0); // nolans

    this.image = '';
    this.text = '';

    //
    // UI helpers
    //
    this.uuid = null;

    this.callback = callback;

    this.reconstruct();
  }

  async render() {
    if (!document.querySelector(this.container)) {
      console.warn('nft card -- missing container');
      return;
    }

    // Single record (backward-compatible behavior)
    this.app.browser.prependElementToSelector(
      NftTemplate(this.app, this.mod, this),
      this.container
    );

    this.insertNftDetails();

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);
  }

  insertNftDetails() {
    let elm = document.querySelector(`#nft-card-${this.uuid} .nft-card-img`);
    if (elm) {
      if (this.text) {
        elm.innerHTML = `<div class="nft-card-text">${this.text}</div>`;
      }
      if (this.image) {
        elm.style.backgroundImage = `url("${this.image}")`;
      }
    } else {
      console.log('Element not rendered');
    }
  }

  async attachEvents() {
    const el = document.querySelector(`#nft-card-${this.uuid}`);
    if (el) {
      el.onclick = () => {
        if (this.callback) {
          this.callback(this);
        } else {
          this.app.connection.emit('saito-nft-details-render-request', this);
        }
      };
    }
  }

  reconstruct() {
    if (!this.tx && !this.id) {
      console.error('Insufficient data to make an nft!');
      return;
    }

    if (this.tx && this.id) {
      // already set
      return;
    }

    if (this.tx) {
      this.tx_sig = this.tx?.signature;
      this.id = this.mod.computeNftIdFromTx(this.tx);

      this.slip1 = this.tx?.to[0] ?? null;
      this.slip2 = this.tx?.to[1] ?? null;
      this.slip3 = this.tx?.to[2] ?? null;

      // ✅ use the new method here
      this.setImageTextFromTx();
    } else {
      // Try local archive
      console.log('Getting tx from archive...');
      this.app.storage.loadTransactions(
        { field4: this.id },
        (txs) => {
          if (txs?.length > 0) {
            this.tx = txs[0];
            console.log('Success!');
            // ✅ only extract image/text
            this.setImageTextFromTx();
            this.insertNftDetails();
          }
        },
        'localhost'
      );
    }

    if (this.slip1?.amount) {
      this.amount = BigInt(this.slip1.amount);
    }

    if (this.slip2?.amount) {
      this.deposit = BigInt(this.slip2.amount);
    }
    this.uuid = this.slip1?.utxo_key;
  }

  /**
   * Extracts NFT image/text data from a transaction
   * and assigns it to this.image / this.text.
   */
  setImageTextFromTx() {
    if (!this.tx) {
      console.warn('No tx!');
      return;
    }

    const tx_msg = this.tx.returnMessage();
    this.data = tx_msg?.data ?? {};

    if (typeof this.data.image !== 'undefined') {
      this.image = this.data.image;
    }

    if (typeof this.data.text !== 'undefined') {
      this.text =
        typeof this.data.text === 'object' && this.data.text !== null
          ? JSON.stringify(this.data.text, null, 2)
          : String(this.data.text);
    }
  }
}

module.exports = NftCard;
