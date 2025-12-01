let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');
let SaitoPurchaseOverlay = require('./saito-purchase');


class BuyNFTOverlay extends NFTDetailsOverlay {

  constructor(app, mod) {
    super(app, mod, false);
    this.purchase_saito = new SaitoPurchaseOverlay(app, mod);
    this.nft = null;
  }

  async render() {

    if (this.nft.tx) {
	console.log("trying to build NFT data...");
      try {
        this.nft.buildNFTData();
      } catch (err) {}
    }

    await super.render();

    document.querySelector(".saito-nft-footer-btn.send").style.display = "none";
    document.querySelector(".saito-nft-footer-btn.enable").style.display = "none";
    document.querySelector(".saito-nft-footer-btn.split").style.display = "none";
    document.querySelector(".saito-nft-footer-btn.merge").style.display = "none";
    document.querySelector(".saito-nft-footer-btn.disable").style.display = "none";

    let priceRaw = await this.nft.getBuyPriceSaito?.();
    let price = typeof priceRaw === 'bigint' ? priceRaw.toString() : (priceRaw ?? '');

    let html = `
      <div class="assetstore-nft-listing-inputs">
        Buy listing for <span id="nft-buy-price">${price}</span> SAITO?
      </div>
    `;

    document.querySelector(".saito-nft-description").innerHTML = html;
    setTimeout(() => { this.attachMyEvents(); }, 25);

  }

  async attachMyEvents() {

    let buy_with_saito_btn = document.querySelector(".saito-nft-footer-btn.enable");
    let buy_with_other_btn = document.querySelector(".saito-nft-footer-btn.disable");

    buy_with_saito_btn.innerHTML = "Buy with Saito";
    buy_with_saito_btn.style.display = "block";
    buy_with_other_btn.innerHTML = "More Options";
    buy_with_other_btn.style.display = "block";

    //
    // BUY WITH SAITO
    //
    if (buy_with_saito_btn) {
      buy_with_saito_btn.onclick = async (e) => {
	siteMessage("Submitting Order: please be patient...", 5000);
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
    if (but_with_other_btn) {

      buy_with_other_btn.onclick = async (e) => {
        e.preventDefault();
        buy_with_other_btn.onclick = (e) => {};
        try {
            this.purchase_saito.reset(); // reset previous selecte options
            this.purchase_saito.nft = this.nft;
            this.purchase_saito.render();
        } catch (err) {
          console.log(err);
          salert('Could not create purchase saito address: ' + err);
        }
      };
    }

  }

  async createDepositAddress(mixin, asset_id, chain_id, ticker) {
    let deposit = await mixin.createDepositAddress(asset_id, chain_id, false);
    if (!deposit) {
      if (this.app.BROWSER) {
        salert('Having problem generating key for ' + ' ' + ticker);
      }
      return null;
    }
    return deposit[0];
  }

}

module.exports = BuyNFTOverlay;
