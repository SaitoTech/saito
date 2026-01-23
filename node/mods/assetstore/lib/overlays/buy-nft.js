let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class BuyNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
    this.nft = null;
  }

  async render() {
    if (this.nft.tx) {
      console.log('trying to build NFT data...');
      try {
        this.nft.buildNFTData();
      } catch (err) {}
    }

    await super.render();

    Array.from(document.querySelectorAll('.saito-nft-footer-btn')).forEach(
      (el) => (el.style.display = 'none')
    );

    let priceRaw = await this.nft.getBuyPriceSaito?.();
    this.price = typeof priceRaw === 'bigint' ? priceRaw.toString() : (priceRaw ?? '');

    let html = `
      <div class="assetstore-nft-listing-inputs">
        Buy listing for <span id="nft-buy-price">${this.price}</span> SAITO?
      </div>
    `;

    if (document.querySelector('.saito-nft-description')) {
      document.querySelector('.saito-nft-description').innerHTML = html;
    }
    setTimeout(() => {
      this.attachMyEvents();
    }, 25);
  }

  async attachMyEvents() {
    let buy_with_saito_btn = document.querySelector('.saito-nft-footer-btn.enable');
    let buy_with_other_btn = document.querySelector('.saito-nft-footer-btn.disable');

    buy_with_saito_btn.innerHTML = 'Buy with Saito';
    buy_with_saito_btn.style.display = 'block';

    //
    // BUY WITH SAITO
    //
    if (buy_with_saito_btn) {
      buy_with_saito_btn.onclick = async (e) => {
        siteMessage('Submitting Order: please be patient...', 5000);
        e.preventDefault();
        buy_with_saito_btn.onclick = (e) => {};
        try {
          let newtx = await this.mod.createPurchaseAssetTransaction(this.nft);
          await this.app.network.propagateTransaction(newtx);
          this.overlay?.hide?.();
          siteMessage('Purchase Submitted. waiting for confirmation...', 3000);
        } catch (err) {
          siteMessage('Error submitting bid: ' + err);
          send_btn.disabled = false;
        }
      };
    }

    //
    // BUY WITH OTHER CRYPTO
    //

    // Add RespondTo to see if we have a buy SAITO option
    // And emit an event!

    if (buy_with_other_btn) {
      buy_with_other_btn.innerHTML = 'More Options';
      buy_with_other_btn.style.display = 'block';

      buy_with_other_btn.onclick = async (e) => {
        e.preventDefault();
        const newtx = await this.mod.createWeb3CryptoPurchase(this.nft);
        this.app.connection.emit(
          'saito-purchase-launch',
          Number(this.price),
          this.mod.assetStore.publicKey,
          newtx.serialize_to_web(this.app),
          `Purchase ${this.price} Saito NFT`
        );
      };
    }
  }
}

module.exports = BuyNFTOverlay;
