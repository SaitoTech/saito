let NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');
let SaitoPurchaseOverlay = require('./saito-purchase');
let AssetStoreBuyNFTTemplate = require('./buy-nft.template');


class BuyNftOverlay extends NftDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
    this.purchase_saito = new SaitoPurchaseOverlay(app, mod);
    this.nft = null;
  }

  async render() {

    if (this.nft.tx) {
console.log("trying to build NFT data...");
      try {
        this.nft.buildNftData();
      } catch (err) {}
    }


    this.overlay.show(AssetStoreBuyNFTTemplate(this.app, this.mod, this.nft));

    let root = this._overlayRoot || document;
    let mount = root.getElementById ? root : document;

    let container = mount.getElementById('nft-details-send');
    if (!container) { return; }

    let priceRaw = await this.nft.getBuyPriceSaito?.();
    let price = typeof priceRaw === 'bigint' ? priceRaw.toString() : (priceRaw ?? '');

    container.innerHTML = `
        <div class="nft-details-buy" style="">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">
              Confirm buy this asset for <span id="nft-buy-price"></span> SAITO?
            </div>
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel" class="saito-button-secondary cancel-action">Close</button>
            <button id="confirm_buy" class="saito-button-primary">Buy Now</button>
          </div>
        </div>
    `;

    let priceNode = mount.getElementById('nft-buy-price');
    if (priceNode) priceNode.textContent = `${price}`;

    //
    // CANCEL
    //
    let cancel = mount.getElementById('cancel');
    if (cancel) { cancel.onclick = () => { this.overlay?.close?.(); }; }

    //
    // BUY
    //
    let send_btn = mount.getElementById('send');
    if (send_btn) {
      send_btn.textContent = 'Buy'; 
      send_btn.onclick = async (e) => {
	siteMessage("Submitting Order: please be patient...", 5000);
        e.preventDefault();
        send_btn.disabled = true;
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
    // BUY OTHER CRYPTO
    //
    if (!mount.getElementById('send_other_crypto')) {

      let purchase_btn = document.createElement('button');
      purchase_btn.id = 'send_other_crypto';
      purchase_btn.className = send_btn.className || 'saito-button-secondary';
      purchase_btn.textContent = 'Buy with other crypto';
      purchase_btn.type = 'button';
      purchase_btn.setAttribute('aria-label', 'Buy with other crypto');
      send_btn.insertAdjacentElement('afterend', purchase_btn);

      purchase_btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            purchase_btn.disabled = true;
          
            //
            // on first render, just show loader
            //
            this.purchase_saito.reset(); // reset previous selecte options
            this.purchase_saito.nft = this.nft;
            this.purchase_saito.render();

        } catch (err) {
          console.log(err);
          salert('Could not create purchase saito address: ' + err);
        } finally {
          purchase_btn.disabled = false;
        }

      });

    }

    this.showBuy();
  }

  attachEvents() {

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

  showBuy() {
    let root = this._overlayRoot || document;
    let buySection = root.querySelector('.nft-details-buy');
    let delistSection = root.querySelector('.nft-details-delist');
    let sendSection = root.querySelector('.nft-details-send-section');

    if (buySection) 	{ buySection.style.display = ''; }
    if (delistSection) 	{ delistSection.style.display = 'none'; }
    if (sendSection) 	{ sendSection.style.display = 'none'; }

    let headerBtn = root.getElementById
      ? root.getElementById('send')
      : document.getElementById('send');
    if (headerBtn) { headerBtn.textContent = 'Buy'; }

  }
}

module.exports = BuyNftOverlay;
