let SaitoNFTCard = require('./../../../../lib/saito/ui/saito-nft/saito-nft-card');
let AssetStoreNFTCardTemplate = require('./assetstore-nft-card.template');
let AssetStoreNFT = require('./assetstore-nft');


class AssetStoreNFTCard extends SaitoNFTCard {


  constructor(app, mod, container = '', tx = null, data = null, mycallback = null) {

    super(app, mod, container, tx, data, mycallback);
    this.tx = tx;
    this.title = "";
    this.description = "";
    this.nft = new AssetStoreNFT(app, mod, tx, data, mycallback, this); // last argument is the card that is rendered
    this.nft.buildNFTData();
    this.callback = mycallback;

  }


  async render() {

    let this_self = this;
    if (!document.querySelector(this.container)) {
      console.warn('nft card -- missing container');
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

    if (this.title) { this.nft.title = this.title; }
    if (this.description) { this.nft.description = this.description; }

    if (document.querySelector(my_qs)) {
      this.app.browser.replaceElementBySelector(
        AssetStoreNFTCardTemplate(this.app, this.mod, this.nft),
        my_qs
      );
    } else {
      this.app.browser.prependElementToSelector(
        AssetStoreNFTCardTemplate(this.app, this.mod, this.nft),
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
      } else {
      }
    }

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);

  }


  insertNFTDetails() {

    if (this.app.BROWSER != 1) {
      return 0;
    }

    let elm = document.querySelector(`.nfttxsig${this.nft.tx_sig} .nft-card-img`);
    if (elm) {
      if (this.nft.text) {
        elm.innerHTML = `<div class="nft-card-text">${this.nft.text}</div>`;
        return;
      }
      if (this.nft.image) {
        elm.style.backgroundImage = `url("${this.nft.image}")`;
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

  async attachEvents() {
    const el = document.querySelector(`.nfttxsig${this.nft.tx_sig}`);
    if (el) {
      el.onclick = () => {
        if (this.callback) {
          this.callback(this.nft);
        } else {
//          this.app.connection.emit('saito-nft-details-render-request', this.nft);
        }
      };
    }
  }


}

module.exports = AssetStoreNFTCard;

