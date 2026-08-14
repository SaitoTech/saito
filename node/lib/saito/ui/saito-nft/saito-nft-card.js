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
    this.expires_timer = null;
  }

  async render() {
    let this_self = this;
    this.stopExpiresTimer();

    if (this.app?.browser?.addStylesheet) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }

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

    let type = document.querySelector(this.my_qs + ' .saito-nft-card-type');
    if (type) {
      type.innerHTML = this.nft.returnType();
    }

    if (this.nft.title) {
      try {
        let telm = document.querySelector(this.my_qs + ' .saito-nft-card-title');
        telm.innerHTML = this.nft.title;
      } catch (err) {}
    }

    let elm = document.querySelector(this.my_qs + ' .saito-nft-card-img');
    if (elm) {
      const display = this.nft.returnMediaDisplay();

      if (display.loading) {
        elm.innerHTML = `<div class="saito-spinner spinner"></div>`;
        elm.style.backgroundImage = '';
        return;
      }

      elm.innerHTML = display.innerHtml || '';
      elm.style.backgroundImage = display.backgroundImage
        ? `url("${display.backgroundImage}")`
        : '';
      this.startExpiresTimer();
    } else {
      console.warn('NFT Element not rendered --', this.my_qs);
    }
  }

  stopExpiresTimer() {
    if (this.expires_timer) {
      clearInterval(this.expires_timer);
      this.expires_timer = null;
    }
  }

  startExpiresTimer() {
    this.stopExpiresTimer();
    if (this.nft.expires_at == null || this.nft.expires_at === '') {
      return;
    }
    this.tickExpiresClock();
    this.expires_timer = setInterval(() => {
      if (!document.querySelector(this.my_qs)) {
        this.stopExpiresTimer();
        return;
      }
      this.tickExpiresClock();
    }, 1000);
  }

  tickExpiresClock() {
    const img = document.querySelector(this.my_qs + ' .saito-nft-card-img');
    if (!img) {
      this.stopExpiresTimer();
      return;
    }
    let clock = img.querySelector('.saito-nft-expires-clock');
    if (!clock) {
      clock = document.createElement('div');
      clock.className = 'saito-nft-expires-clock';
      img.appendChild(clock);
    }
    clock.textContent = this.nft.remainingExpiresLabel();
  }
}

module.exports = SaitoNFTCard;
