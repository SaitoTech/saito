const SaitoNFTCardTemplate = require('./saito-nft-card.template');
const SaitoNFT = require('./saito-nft');
const SaitoNFTDetails = require('./overlays/nft-overlay');

class SaitoNFTCard {
  constructor(app, mod, container = '', tx = null, data = null, callback = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.nft = new SaitoNFT(app, mod, tx, data);

    //
    // UI helpers
    //
    this.callback = callback;
  }

  async render() {
    let this_self = this;

    if (!document.querySelector(this.container)) {
      return;
    }

    //
    // if nft.slip1 is not there we cant render nft-card
    // nft.slip1.utxo_key is used as unique identifier for nft-card UI
    // first fetch nft tx, it will give us slip1 then render UI
    //
    if (!this.nft.slip2) {
      await this.nft.fetchTransaction();
    }

    //
    // render can be writing a NEW NFT Card or attempting to re-render
    // an existing one.
    //
    let my_qs = this.container + ' .nfttxsig' + this.nft.tx_sig;

    if (document.querySelector(my_qs)) {
      this.app.browser.replaceElementBySelector(
        SaitoNFTCardTemplate(this.app, this.mod, this.nft),
        my_qs
      );
    } else {
      this.app.browser.prependElementToSelector(
        SaitoNFTCardTemplate(this.app, this.mod, this.nft),
        this.container
      );
    }

    //
    // avoid re-fetching of nft tx
    //
    if (!this.nft.tx_fetched) {
      this.nft.fetchTransaction(function () {
        this_self.insertNFTDetails();
      });
    } else {
      if (this.nft?.tx) {
        this.insertNFTDetails();
      }
    }

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);
  }

  async attachEvents() {
    const el = document.querySelector(`.nfttxsig${this.nft.tx_sig}`);
    if (el) {
      el.onclick = () => {
        if (this.callback) {
          this.callback(this.nft);
        } else {
          this.app.connection.emit('saito-nft-details-render-request', this.nft);
        }
      };
    }
  }

  insertNFTDetails() {
    if (this.app.BROWSER != 1) {
      return 0;
    }

    let elm = document.querySelector(`.nfttxsig${this.nft.tx_sig} .nft-card-img`);
    if (elm) {
      if (this.nft.image != '') {
        elm.innerHTML = '';
        elm.style.backgroundImage = `url("${this.nft.image}")`;
        return;
      }
      if (this.nft.js != '') {
        elm.innerHTML = `<div class="nft-card-text">${this.nft.js}</div>`;
        return;
      }
      if (this.nft.css != '') {
        elm.innerHTML = `<div class="nft-card-text">${this.nft.css}</div>`;
        return;
      }
      if (this.nft.text != '') {
        elm.innerHTML = `<div class="nft-card-text">${this.nft.text}</div>`;
        return;
      }
      if (this.nft.json != '') {
        elm.innerHTML = `<div class="nft-card-text">${this.nft.json}</div>`;
        return;
      }

      if (this.nft.load_failed) {
        elm.innerHTML = `<i class="fa-solid fa-heart-crack"></i>`;
      } else {
        elm.innerHTML = `<img class="spinner" src="/saito/img/spinner.svg">`;
      }
    } else {
      console.log('Element not rendered');
    }
  }
}

module.exports = SaitoNFTCard;
