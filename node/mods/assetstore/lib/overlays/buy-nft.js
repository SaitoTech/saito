let NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class BuyNftOverlay extends NftDetailsOverlay {

  constructor(app, mod) {

    super(app, mod, false);

  }

  async render() {

    await super.render();

    let this_self = this;

    let root = this._overlayRoot || document;
    let mount = root.getElementById ? root : document;
    let target = mount.getElementById('nft-details-send');
    if (!target) { return; }
 
    let price = this.nft.getBuyPriceSaito();

    let html = `
      <div class="nft-details-action" id="nft-details-send">
        <div class="nft-details-buy" style="display:none">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">Confirm buy this asset for ${price} SAITO?</div>
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel" class="saito-button-secondary cancel-action">Close</button>
            <button id="confirm_buy" class="saito-button-primary">Buy Now</button>
          </div>
        </div>
      </div>
    `;
    this.app.browser.replaceElementById(html, 'nft-details-send');

    let send_btn_label = mount.getElementById('send');
    if (send_btn_label) { send_btn_label.textContent = 'Buy'; }

    let cancel = mount.getElementById('cancel');
    if (cancel) {
      cancel.onclick = () => {
        this.overlay.close();
      }
    }
    let cancel2 = mount.getElementById('cancel2');
    if (cancel2) { 
      cancel2.onclick = () => {
        this.overlay.close();
      }
    }

    let buy = mount.getElementById('confirm_buy');
    if (buy) {
      buy.onclick = async (e) => {
        e.preventDefault();
        try {
          let newtx = await this.mod.createPurchaseAssetTransaction(this.nft);
          await this.app.network.propagateTransaction(newtx);
          this.overlay.hide();
          siteMessage('Purchase submitted. Waiting for network confirmation...', 3000);
        } catch (err) {
          salert('Failed to buy: ' + (err));
        }
      };
    }


    this.showBuy();

  }

  showBuy() {

    let root = this._overlayRoot || document;
    let buy_section    = root.querySelector('.nft-details-buy');
    let delist_section = root.querySelector('.nft-details-send');
    let header_send_btn = root.getElementById 
      ? root.getElementById('send') 
      : document.getElementById('send');

    if (buy_section)    { buy_section.style.display = ''; }
    if (delist_section) { delist_section.style.display = 'none'; }
    if (header_send_btn) { header_send_btn.textContent = 'Buy'; }

  }

}

module.exports = BuyNftOverlay;
