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

    this.load_failed = false;

    //
    // UI helpers
    //
    this.uuid = null;

    this.callback = callback;

    this.reconstruct();
  }

  render() {
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

  /**
   *  Lazy load images and render when available
   */
  insertNftDetails() {
    let elm = document.querySelector(`#nft-card-${this.uuid} .nft-card-img`);
    if (elm) {
      if (this.text) {
        elm.innerHTML = `<div class="nft-card-text">${this.text}</div>`;
        return;
      }
      if (this.image) {
        elm.innerHTML = '';
        elm.style.backgroundImage = `url("${this.image}")`;
        return;
      }

      if (this.load_failed) {
        elm.innerHTML = `<i class="fa-solid fa-heart-crack"></i>`;
      } else {
        elm.innerHTML = `<img class="spinner" src="/saito/img/spinner.svg">`;
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

  /**
   *  Depending on whether we are creating the nft[card] with a tx or the wallet.options saved data
   *  recover the missing information and update rendering (if needed)
   *
   *  CALLBACK > AWAIT
   */
  reconstruct() {
    let this_self = this;
    if (!this.tx && !this.id) {
      console.error('Insufficient data to make an nft!');
      return;
    }

    if (this.tx && this.id) {
      console.log('Huzzah have a perfectly good nft!');
      // already set
      return;
    }

    if (this.tx) {
      //
      // tx is available we can extract slips & txmsg data (img/text)
      //
      this.tx_sig = this.tx?.signature;
      this.id = this.mod.computeNftIdFromTx(this.tx);

      this.slip1 = this.tx?.to[0] ?? null;
      this.slip2 = this.tx?.to[1] ?? null;
      this.slip3 = this.tx?.to[2] ?? null;
    } else {
      //
      // tx isn't available (probably creating nft from id)
      // load tx from archive to get txmsg data (image/text)
      //
      this.app.storage.loadTransactions(
        { field4: this.id },

        async (txs) => {
          if (txs?.length > 0) {
            this.tx = txs[0];
            this.extractNFTData();
            this.insertNftDetails();
          } else {
            //
            // Try remote host (which **IS NOT** CURRENTLY INDEXING NFT TXS)
            //
            let peer = await this.app.network.getPeers();

            this.app.storage.loadTransactions(
              { field4: this.id },
              (txs) => {
                if (txs?.length > 0) {
                  this.tx = txs[0];
                  this.extractNFTData();
                  this.insertNftDetails();
                  //
                  // And save locally!
                  //
                  this.app.storage.saveTransaction(this.tx, { field4: this.id }, 'localhost');
                } else {
                  this.load_failed = true;
                  this.insertNftDetails();
                }
              },
              peer?.length ? peer[0] : null
            );
          }
        },
        'localhost'
      );
    }

    this.extractNFTData();

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
  extractNFTData() {
    if (!this.tx) {
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
