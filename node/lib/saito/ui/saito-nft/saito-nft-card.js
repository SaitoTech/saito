const SaitoNFTCardTemplate = require('./saito-nft-card.template');
const SaitoNFT = require('./saito-nft');

class SaitoNFTCard {
  constructor(app, mod, container = '', tx = null, data = null, callback = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.nft = new SaitoNFT(app, mod, tx, data);
    this.template = SaitoNFTCardTemplate;
    this.my_qs = this.container + ` #nft-card-${this.nft.uuid}`;

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

    if (document.querySelector(this.my_qs)) {
      this.app.browser.replaceElementBySelector(
        this.template(this.app, this.mod, this.nft),
        this.my_qs
      );
    } else {
      this.app.browser.prependElementToSelector(
        this.template(this.app, this.mod, this.nft),
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
        console.warn('NFT-Card: No transaction..., cannot insert details...');
      }
    }

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);
  }

  async attachEvents() {
    const el = document.querySelector(this.my_qs);
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
    if (!this.app.BROWSER) {
      return 0;
    }

    console.log('Insert fetched NFT details into CARD');

    let type = document.querySelector(this.my_qs + ' .nft-card-type');
    if (type) {
      type.innerHTML = this.nft.returnType();
    }

    if (this.nft.title) {
      try {
        let telm = document.querySelector(this.my_qs + ' .nft-card-title');
        telm.innerHTML = this.nft.title;
      } catch (err) {}
    }

    let elm = document.querySelector(this.my_qs + ' .nft-card-img');
    if (elm) {
      if (this.nft.nft_type == 'vault') {
        try {
          elm.innerHTML = `<div class="nft-card-text">${this.nft.json}</div>`;
          let obj = JSON.parse(this.nft.json);
          elm.style.backgroundImage = `url("/vault/img/jade_key_min.png")`;
          if (obj.file_access_script) {
            elm.style.backgroundImage = `url("/vault/img/crystal_key_min.png")`;
          }
          return;
        } catch (err) {}
      }
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
        elm.innerHTML = `<div class="saito_spinner spinner"></div>`;
      }
    } else {
      console.warn('NFT Element not rendered --', this.my_qs);
    }
  }
}

module.exports = SaitoNFTCard;
